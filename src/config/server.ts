import { PrismaClient } from "@prisma/client";
import { error } from "console";
import cors from 'cors';
import express from 'express';
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const saltRounds = 10;
require('dotenv').config();
const dated = require('date-and-time');
const bodyParser = require('body-parser');
const xml2js = require('xml2js');

const { Pool } = require('pg');


//discord channels notifications
const NOTIFICACOES_PAGAMENTOS = "https://discordapp.com/api/webhooks/1284494163064389715/KrceUNN0WZxJ4BD14ol0c6o6fh0uhrirbsdBlNdIrJfFUFzMp_Iaf7e0CY5dFm-RcS-f";
const NOTIFICACOES_LOGINS = "https://discordapp.com/api/webhooks/1284489125042458707/NdEPJPIZzALdiJiMM3aY9qVEJlHyvt08y1SOrHcJDe-7e4HLJR6Opha3ojVjSP4NwniB";
const NOTIFICACOES_CLIENTES = "https://discordapp.com/api/webhooks/1284489125042458707/NdEPJPIZzALdiJiMM3aY9qVEJlHyvt08y1SOrHcJDe-7e4HLJR6Opha3ojVjSP4NwniB";
const NOTIFICACOES_GERAL = "https://discordapp.com/api/webhooks/1284499691622367355/gjb-kKnYLVOvxaKDtPb0FfSnxOHADTvvk054Y9htrf_d7yjnuPUVYmE_rMEMrXk5BfEK";
const NOTIFICACOES_CREDITO_REMOTO = "https://discordapp.com/api/webhooks/1284499691622367355/gjb-kKnYLVOvxaKDtPb0FfSnxOHADTvvk054Y9htrf_d7yjnuPUVYmE_rMEMrXk5BfEK";


//jwt
const jwt = require('jsonwebtoken')
const SECRET = process.env.JWT_SECRET;
const SECRET_REDEFINICAO = process.env.JWT_SECRET_REDEFINICAO;
const SECRET_PESSOA = process.env.JWT_SECRET_PESSOA;



//axios
const axios = require('axios');
axios.defaults.headers.common['Authorization'] = `Bearer ${process.env.TOKEN_DE_SUA_CONTA_MP}`;

const PORT: string | number = process.env.PORT || 5001;

const app = express();

app.use(cors());

//app.use(express.json());

// Configuração do bodyParser para receber dados em URL-encoded e JSON
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


interface Error {
  message: string;
};

//midware de verificação JWT válido.
function verifyJWT(req: any, res: any, next: any) {
  const token = req.headers['x-access-token'];
  jwt.verify(token, SECRET, (err: any, decoded: any) => {
    if (err) return res.status(401).end();
    req.userId = decoded.userId;
    next();
  })
}

//midware de verificação JWT redefinicao de senha.
function verifyJWT2(req: any, res: any, next: any) {
  const token = req.headers['x-access-token'];
  jwt.verify(token, SECRET_REDEFINICAO, (err: any, decoded: any) => {
    if (err) return res.status(401).json({
      error: `Invalid or Expired Token. Make sure you add a Header 
    Parameter named x-access-token with the token provided when an email to reset password has been sent.` });
    req.userId = decoded.userId;
    next();
  })
}

//midware de verificação JWT PESSOA
function verifyJwtPessoa(req: any, res: any, next: any) {
  const token = req.headers['x-access-token'];
  jwt.verify(token, SECRET_PESSOA, (err: any, decoded: any) => {
    if (err) return res.status(401).json({
      error: `Invalid or Expired Token. Make sure you add a Header 
    Parameter named x-access-token with the token provided when an email to reset password has been sent.` });
    req.userId = decoded.userId;
    next();
  })
}



function stringDateFormatted(time: number) {
  let result;
  let totalSeconds = time;
  let hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  result = `${hours.toString().padStart(2, "0")}h:${minutes.toString().padStart(2, "0")}m`
  return result;
}


//INTEGRAÇÃO PIX V2

var valordoPixMaquinaBatomEfi01 = 0; //txid 70a8cacb59b53eac8ccb

var valordoPixPlaquinhaPixMP = 5000; //storeid 



function converterPixRecebido(valorPix: number) {
  var valorAux = 0;
  var ticket = 1;
  if (valorPix > 0 && valorPix >= ticket) {
    valorAux = valorPix;
    valorPix = 0;
    //creditos
    var creditos = valorAux / ticket;
    creditos = Math.floor(creditos);
    var pulsos = creditos * ticket;
    var pulsosFormatados = ("0000" + pulsos).slice(-4);
    return pulsosFormatados;
  } else {
    return "0000";
  }
}

//permite facilmente a alteração de valor do preço dos produtos.
function converterPixRecebidoDinamico(valorPix: number, pulso: number) {
  var valorAux = 0;
  var ticket = pulso;
  if (valorPix > 0 && valorPix >= ticket) {
    valorAux = valorPix;
    valorPix = 0;
    //creditos
    var creditos = valorAux / ticket;
    creditos = Math.floor(creditos);
    //var pulsos = creditos * ticket;
    var pulsosFormatados = ("0000" + creditos).slice(-4);
    return pulsosFormatados;
  } else {
    return "0000";
  }
}

//Retorna em segundos o tempo desde a ultima Consulta efetuada em uma máquina.
function tempoOffline(data2: Date): number {
  var data1 = new Date();
  if (!(data1 instanceof Date) || !(data2 instanceof Date)) {
    throw new Error('Datas inválidas');
  }

  // Calcule a diferença em milissegundos
  const diferencaEmSegundos = Math.abs((data2.getTime() - data1.getTime()) / 1000);

  return diferencaEmSegundos;
}

async function notificar(urlDiscordWebhook: string, online: string, offline: string) {
  //An array of Discord Embeds.
  let embeds = [
    {
      title: "Monitoramento de Máquinas",
      color: 5174599,
      footer: {
        text: `📅 ${new Date()}`,
      },
      fields: [
        {
          name: "Online: " + online,
          value: "Offline: " + offline
        },
      ],
    },
  ];

  //Stringify the embeds using JSON.stringify()
  let data = JSON.stringify({ embeds });

  //Create a config object for axios, you can also use axios.post("url", data) instead
  var config = {
    method: "POST",
    url: urlDiscordWebhook,
    headers: { "Content-Type": "application/json" },
    data: data,
  };

  //Send the request
  axios(config)
    .then((response: any) => {
      console.log("Webhook delivered successfully");
      return response;
    })
    .catch((error: any) => {
      console.log(error);
      return error;
    });
}

async function notificarDiscord(urlDiscordWebhook: string, titulo: string, detalhe: string) {
  //An array of Discord Embeds.
  let embeds = [
    {
      title: titulo,
      color: 5174599,
      footer: {
        text: `📅 ${new Date()}`,
      },
      fields: [
        {
          name: '',
          value: detalhe
        },
      ],
    },
  ];

  //Stringify the embeds using JSON.stringify()
  let data = JSON.stringify({ embeds });

  //Create a config object for axios, you can also use axios.post("url", data) instead
  var config = {
    method: "POST",
    url: urlDiscordWebhook,
    headers: { "Content-Type": "application/json" },
    data: data,
  };

  //Send the request
  axios(config)
    .then((response: any) => {
      console.log("Webhook delivered successfully");
      return response;
    })
    .catch((error: any) => {
      console.log(error);
    });
}


function gerarNumeroAleatorio(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


async function estornar(id: string) {
  const url = `https://api.mercadopago.com/v1/payments/${id}/refunds`;

  try {

    const response = await axios.post(url, {}, {
      headers: {
        'Authorization': `Bearer ${process.env.TOKEN_DE_SUA_CONTA_MP}`,
        'X-Idempotency-Key': `${gerarNumeroAleatorio()}`,
      },
    });

    console.log("estorno da operação: " + id + " efetuado com sucesso!")

    return response.data;

  } catch (error) {

    console.log("houve um erro ao tentar efetuar o estorno da operação: " + id);
    console.log("detalhes do erro: " + error)

  }
}

function esconderString(string: string) {
  const tamanho = string.length;
  let resultado = '';

  for (let i = 0; i < tamanho - 3; i++) {
    resultado += '*';
  }

  resultado += string.substring(tamanho - 3, tamanho);
  return resultado;
}

let numTentativasEstorno = 1;
let idempotencyKeyAnterior = "";

function gerarChaveIdempotente() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let chave = '';

  for (let i = 0; i < 32; i++) {
    chave += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }

  return chave;
}

async function estornarMP(id: string, token: string, motivoEstorno: string, tamanhoChave = 32) {
  const url = `https://api.mercadopago.com/v1/payments/${id}/refunds`;

  try {
    console.log('********* estornando *****************');
    console.log(`********* Tentativa nª ${numTentativasEstorno} *****************`);
    console.log(id);
    console.log('********* token *****************');
    console.log(esconderString(token));

    let idempotencyKey = gerarChaveIdempotente();

    // Efetuando o estorno
    const response = await axios.post(url, {}, {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(response.data);
    console.log("Estorno da operação: " + id + " efetuado com sucesso!")
    numTentativasEstorno = 1;

    // Se a solicitação for bem-sucedida, salve o valor do cabeçalho X-Idempotency-Key para uso futuro
    idempotencyKeyAnterior = response.headers['x-idempotency-key'];

    return response.data;

  } catch (error) {

    console.log("Houve um erro ao tentar efetuar o estorno da operação: " + id);
    console.log("Detalhes do erro: " + error);

    numTentativasEstorno++;

    if (numTentativasEstorno < 20) { // LIMITE DE TENTATIVAS DE ESTORNO
      await estornarMP(id, token, motivoEstorno, tamanhoChave);
    } else {
      console.log("Após 20 tentativas não conseguimos efetuar o estorno, VERIFIQUE O TOKEN DO CLIENTE!!");
      numTentativasEstorno = 1;

    }

  }
}

//variáveis de controle

var valorDoPixMaquina01 = 0;
var ultimoAcessoMaquina01 = new Date('2023-10-20T17:30:10');

//rotas de consulta

app.get("/consulta-maquina01", async (req, res) => {
  var pulsosFormatados = converterPixRecebido(valorDoPixMaquina01); //<<<<<<ALTERAR 

  valorDoPixMaquina01 = 0; //<<<<<<<<<ALTERAR 

  ultimoAcessoMaquina01 = new Date(); //<<<<<<<<<ALTERAR 

  if (pulsosFormatados != "0000") {
    return res.status(200).json({ "retorno": pulsosFormatados });
  } else {
    return res.status(200).json({ "retorno": "0000" });
  }
});

//notitica em um canal do discord
app.get("/online", async (req, res) => {

  var maquinasOffline = "";
  var maquinasOnline = "";

  //Relação das Máquinas que você tem:

  if (tempoOffline(ultimoAcessoMaquina01) >= 1) {
    maquinasOffline += " Máquina 1";
  } else {
    maquinasOnline += " Máquina 1"
  }

  //caso queira enviar notificações usando o discord crie uma sala de texto e copie o webhook url para cá:
  var urlDoWebhookNoDiscord = "https://discord.com/api/webhooks/1165681639930732544/V3TrmmGnyx11OtyHxotSv31L1t6ASC_eF6NOk_1AmhD";

  if (maquinasOffline != "") {
    notificar(urlDoWebhookNoDiscord, maquinasOnline, maquinasOffline);
  }

  return res.status(200).json({ "Máquina 01": "Sucesso" });

});

app.get("/monitoramento-html", async (req, res) => {

  // Construir a tabela em HTML com CSS embutido
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Monitoramento das Máquinas</title>
    <style>
      table {
        width: 50%;
        border-collapse: collapse;
        margin: 0 auto; /* Centralizar a tabela */
      }
      th, td {
        border: 1px solid #000;
        padding: 10px;
        text-align: center; /* Centralizar o texto */
      }
      th {
        background-color: #f0f0f0;
        font-weight: bold;
      }
      /* Estilo para aumentar o tamanho da fonte */
      td, th {
        font-size: 18px;
      }
    </style>
    <script>
    // Função para atualizar a página a cada 15 segundos
    function atualizarPagina() {
       location.reload();
    }

    // Configura o temporizador para chamar a função a cada 5 segundos (15000 milissegundos)
    setInterval(atualizarPagina, 5000);
   </script>
  </head>
  <body>
    <table>
      <tr>
        <th>Máquina</th>
        <th>Status</th>
      </tr>
      
        <tr>
          <td>Máquina 01</td>
          <td>${tempoOffline(ultimoAcessoMaquina01) >= 10 ? '<b>OFFLINE********</b> ' : 'ONLINE'}</td>
        </tr>
      
    </table>
  </body>
  </html>
`;

  // Enviar a resposta como HTML.
  res.send(html);
});


app.get("/consulta-pix-efi-maq-batom-01", async (req, res) => {
  var pulsosFormatados = converterPixRecebido(valordoPixMaquinaBatomEfi01); //<<<<<<ALTERAR PARA O NUMERO DA MAQUINA

  valordoPixMaquinaBatomEfi01 = 0; //<<<<<<<<<ALTERAR PARA O NUMERO DA MAQUINA

  if (pulsosFormatados != "0000") {
    return res.status(200).json({ "retorno": pulsosFormatados });
  } else {
    return res.status(200).json({ "retorno": "0000" });
  }
});



function converterPixRecebidoMercadoPago(valorPix: number) {
  var valor = ("0000000" + valorPix).slice(-7);
  return valor;
}

app.get("/consulta-pix-mp-maq-plaquinha-01", async (req, res) => {
  var aux = converterPixRecebidoMercadoPago(valordoPixPlaquinhaPixMP);
  valordoPixPlaquinhaPixMP = 0;
  ultimoAcessoMaquina01 = new Date(); //<<<<<<<<<ALTERAR 
  return res.status(200).json({ "R$: ": aux });
});//.



app.post("/rota-recebimento", async (req, res) => {
  try {
    var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log("ip");
    console.log(ip);
    var qy = req.query.hmac;
    console.log("query");
    console.log(qy);

    if (ip != '34.193.116.226') {
      return res.status(401).json({ "unauthorized": "unauthorized" });
    }


    if (qy != 'myhash1234' && qy != 'myhash1234/pix') {
      return res.status(401).json({ "unauthorized": "unauthorized" });
    }

    console.log("Novo chamada a essa rota detectada:");
    console.log(req.body);

    if (req.body.pix) {

      console.log("valor do pix recebido:");
      console.log(req.body.pix[0].valor);

      if (req.body.pix) {

        if (req.body.pix[0].txid == "70a8cacb59b53eac8ccb") {
          valordoPixMaquinaBatomEfi01 = req.body.pix[0].valor;
          console.log("Creditando valor do pix na máquina de Batom 01");
        }


      }
    }
  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "error: " + error });
  }
  return res.status(200).json({ "ok": "ok" });
});


app.post("/rota-recebimento-teste", async (req, res) => {
  try {
    console.log("Novo pix detectado:");
    console.log(req.body);

    console.log("valor:");
    console.log(req.body.valor);
    console.log("txid:");
    console.log(req.body.txid);

    var txid = req.body.txid;
    if (txid == "flaksdfjaskldfjadfasdfccc") {
      valordoPixMaquinaBatomEfi01 = req.body.valor;
      console.log("setado valor pix para:" + req.body.valor);
    }


    console.log(req.body.valor);
  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "error: " + error });
  }
  return res.status(200).json({ "mensagem": "ok" });
});



app.post("/rota-recebimento-mercado-pago", async (req: any, res: any) => {
  try {
    console.log("Novo pix do Mercado Pago:");
    console.log(req.body);

    console.log("id");
    console.log(req.query.id);

    var url = "https://api.mercadopago.com/v1/payments/" + req.query.id;

    axios.get(url)
      .then((response: { data: { store_id: string; transaction_amount: number; status: string }; }) => {
        //console.log('Response', response.data)
        if (response.data.status != "approved") {
          console.log("pagamento não aprovado!");
          return;
        }

        console.log('store_id', response.data.store_id);
        console.log('storetransaction_amount_id', response.data.transaction_amount);

        //creditar de acordo com o store_id (um para cada maq diferente)
        if (response.data.store_id == '56155276') {
          if (tempoOffline(ultimoAcessoMaquina01) >= 10) {
            console.log("Efetuando estorno - Máquina Offline!")
            estornar(req.query.id);
          } else {
            console.log("Creditando pix na máquina 1. store_id(56155276)")
            valorDoPixMaquina01 = response.data.transaction_amount;
            valordoPixPlaquinhaPixMP = response.data.transaction_amount;
          }
        }

      })
  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "error: " + error });
  }
  return res.status(200).json({ "mensagem": "ok" });
});



//fim integração pix V2


//rotas integração pix  v3
//CADASTRO DE ADMINISTRADOR ADM
// app.post("/pessoa", async (req, res) => {
//   try {
//     const salt = await bcrypt.genSalt(10);
//     req.body.senha = await bcrypt.hash(req.body.senha, salt);
//     //req.body.dataInclusao = new Date(Date.now());

//     const pessoa = await prisma.pix_Pessoa.create({ data: req.body });

//     pessoa.senha = "";

//     return res.json(pessoa);
//   } catch (err: any) {
//     console.log(err);
//     return res.status(500).json({ error: `>>:${err.message}` });
//   }
// });

//iniciar v4
app.post("/config", async (req, res) => {
  try {

    // console.log(req.body);
    // return res.status(200).json({ msg: "Cadastro efetuado com sucesso! Acesse o painel ADM V4" });


    const p = await prisma.pix_Pessoa.findFirst();

    if (p) {
      return res.status(500).json({ error: `Já existe adm cadastrado!` });
    } else {
      const salt = await bcrypt.genSalt(10);
      req.body.senha = await bcrypt.hash(req.body.senha, salt);
      //req.body.dataInclusao = new Date(Date.now());

      const pessoa = await prisma.pix_Pessoa.create({ data: req.body });

      pessoa.senha = "";

      return res.status(200).json({ msg: "Cadastro efetuado com sucesso! Acesse o painel ADM V4" });

    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>>:${err.message}` });
  }
});


app.post("/cliente", verifyJwtPessoa, async (req: any, res) => {

  try {
    const salt = await bcrypt.genSalt(10);

    req.body.senha = await bcrypt.hash(req.body.senha, salt);

    req.body.pessoaId = req.userId;

    const cliente = await prisma.pix_Cliente.create({ data: req.body });

    cliente.senha = "";

    return res.json(cliente);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>>:${err.message}` });
  }
});

app.put("/cliente", verifyJwtPessoa, async (req: any, res) => {

  try {


    req.body.pessoaId = req.userId;

    var clienteAtualizado = await prisma.pix_Cliente.update({
      where: {
        id: req.body.id,
      },
      data:
      {
        nome: req.body.nome,
        mercadoPagoToken: req.body.mercadoPagoToken,
        dataVencimento: req.body.dataVencimento
      },
      select: {
        id: true,
        nome: true,
        mercadoPagoToken: false,
        dataVencimento: true
        // Adicione outros campos conforme necessário
      },
    });


    return res.json(clienteAtualizado);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>>:${err.message}` });
  }
});

app.delete('/cliente/:id', verifyJwtPessoa, async (req, res) => {
  const clienteId = req.params.id;

  try {
    // Verificar se o cliente existe
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: clienteId,
      },
    });

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    // Excluir o cliente
    await prisma.pix_Cliente.delete({
      where: {
        id: clienteId,
      },
    });

    res.json({ message: 'Cliente excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir o cliente:', error);
    res.status(500).json({ error: 'Erro ao excluir o cliente' });
  }
});


app.put('/alterar-cliente-adm-new/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, mercadoPagoToken, pagbankToken, dataVencimento, pagbankEmail } = req.body;

  try {
    // Atualiza o cliente no banco de dados
    const updatedCliente = await prisma.pix_Cliente.update({
      where: { id },
      data: {
        nome,
        mercadoPagoToken,
        pagbankToken, // Agora o pagbankToken também pode ser atualizado
        pagbankEmail,
        dataVencimento,
      },
    });

    // Protege os campos mercadoPagoToken e pagbankToken
    const protectedCliente = { ...updatedCliente };

    // Oculta parcialmente o mercadoPagoToken
    if (protectedCliente.mercadoPagoToken) {
      protectedCliente.mercadoPagoToken = protectedCliente.mercadoPagoToken.slice(-3).padStart(protectedCliente.mercadoPagoToken.length, '*');
    }

    // Oculta parcialmente o pagbankToken
    if (protectedCliente.pagbankToken) {
      protectedCliente.pagbankToken = protectedCliente.pagbankToken.slice(-3).padStart(protectedCliente.pagbankToken.length, '*');
    }

    // Protege o campo senha, caso exista
    if (protectedCliente.senha) {
      protectedCliente.senha = '***'; // Substitua por uma string de sua escolha
    }

    res.json(protectedCliente);
  } catch (error) {
    console.error('Erro ao alterar o cliente:', error);
    res.status(500).json({ "message": 'Erro ao alterar o cliente' });
  }
});




app.put("/cliente-sem-token", verifyJwtPessoa, async (req: any, res) => {

  try {


    req.body.pessoaId = req.userId;

    var clienteAtualizado = await prisma.pix_Cliente.update({
      where: {
        id: req.body.id,
      },
      data:
      {
        nome: req.body.nome,
        dataVencimento: req.body.dataVencimento
      },
      select: {
        id: true,
        nome: true,
        mercadoPagoToken: false,
        dataVencimento: true
        // Adicione outros campos conforme necessário
      },
    });


    return res.json(clienteAtualizado);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>>:${err.message}` });
  }
});

function criarSenha() {
  const caracteres = '0123456789abcdefghijklmnopqrstuvwxyz';
  let textoAleatorio = '';

  for (let i = 0; i < 8; i++) {
    const indiceAleatorio = Math.floor(Math.random() * caracteres.length);
    textoAleatorio += caracteres.charAt(indiceAleatorio);
  }

  return textoAleatorio;
}

app.put("/cliente-trocar-senha", verifyJwtPessoa, async (req: any, res) => {

  var novaSenha = "";
  var senhaCriptografada = "";

  try {

    novaSenha = criarSenha();

    const salt = await bcrypt.genSalt(10);

    senhaCriptografada = await bcrypt.hash(novaSenha, salt);

    const clienteAtualizado = await prisma.pix_Cliente.update({
      where: { email: req.body.email },
      data: { senha: senhaCriptografada },
    });

    if (clienteAtualizado) {

      if (NOTIFICACOES_GERAL) {
        notificarDiscord(NOTIFICACOES_GERAL, "Troca de senha efetuada", `Cliente ${clienteAtualizado.nome} acabou de ter sua senha redefinida.`)
      }

      return res.json({ "newPassword": novaSenha });
    } else {
      return res.status(301).json({ error: `>>:cliente não encontrado` });
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>:cliente não encontrado` });
  }
});

// //TROCAR SENHA ADM LOGADO
// app.put("/trocar-senha-adm", verifyJwtPessoa, async (req: any, res) => {

//   var novaSenha = "";
//   var senhaCriptografada = "";

//   try {

//     novaSenha = criarSenha();

//     const salt = await bcrypt.genSalt(10);

//     senhaCriptografada = await bcrypt.hash(novaSenha, salt);

//     const clienteAtualizado = await prisma.pix_Pessoa.update({
//       where: { email: req.body.email },
//       data: { senha: senhaCriptografada },
//     });

//     if (clienteAtualizado) {
//       return res.json({ "newPassword": novaSenha });
//     } else {
//       return res.status(301).json({ "message": `>>:adm não encontrado` });
//     }

//   } catch (err: any) {
//     console.log(err);
//     return res.status(500).json({ "message": `>:adm não encontrado` });
//   }
// });

//cadastrar nova máquina adm
app.post("/maquina", verifyJwtPessoa, async (req: any, res) => {
  try {
    req.body.pessoaId = req.userId;

    // Inicializa as condições com nome e clienteId, que são obrigatórios
    const condicoes: any[] = [
      {
        nome: req.body.nome,
        clienteId: req.body.clienteId
      }
    ];

    // Adicione condicionalmente o store_id se ele não for nulo ou undefined
    if (req.body.store_id) {
      condicoes.push({
        store_id: req.body.store_id,
        clienteId: req.body.clienteId
      });
    }

    // Adicione condicionalmente o maquininha_serial se ele não for nulo ou undefined
    if (req.body.maquininha_serial) {
      condicoes.push({
        maquininha_serial: req.body.maquininha_serial,
        clienteId: req.body.clienteId
      });
    }

    // Verifique se já existe uma máquina com os dados fornecidos
    const maquinaExistente = await prisma.pix_Maquina.findFirst({
      where: {
        OR: condicoes
      },
      select: {
        id: true, // Retorna o ID da máquina conflitante
        nome: true, // Retorna o nome da máquina conflitante
        store_id: true, // Retorna o store_id da máquina conflitante
        maquininha_serial: true // Retorna o maquininha_serial da máquina conflitante
      }
    });

    if (maquinaExistente) {
      return res.status(400).json({
        error: `Já existe uma máquina com o nome (${maquinaExistente.nome}), store_id (${maquinaExistente.store_id}) ou maquininha_serial (${maquinaExistente.maquininha_serial}) para este cliente.`,
      });
    }

    // Cria a nova máquina, caso não haja conflitos
    const maquina = await prisma.pix_Maquina.create({ data: req.body });

    return res.json(maquina);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `Erro ao criar a máquina: ${err.message}` });
  }
});


app.post("/maquina-cliente", verifyJWT, async (req: any, res) => {
  try {
    req.body.clienteId = req.userId;
    // Busca o cliente e o pessoaId através da tabela Pix_Cliente
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.body.clienteId, // Usando o clienteId passado no corpo da requisição
      },
      select: {
        pessoaId: true, // Seleciona o campo pessoaId relacionado
      },
    });

    // Verifica se o cliente foi encontrado
    if (!cliente) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    // Atribui o pessoaId ao corpo da requisição
    req.body.pessoaId = cliente.pessoaId;

    // Inicializa as condições com nome e clienteId, que são obrigatórios
    const condicoes: any[] = [
      {
        nome: req.body.nome,
        clienteId: req.body.clienteId
      }
    ];

    // Adicione condicionalmente o store_id se ele não for nulo ou undefined
    if (req.body.store_id) {
      condicoes.push({
        store_id: req.body.store_id,
        clienteId: req.body.clienteId
      });
    }

    // Adicione condicionalmente o maquininha_serial se ele não for nulo ou undefined
    if (req.body.maquininha_serial) {
      condicoes.push({
        maquininha_serial: req.body.maquininha_serial,
        clienteId: req.body.clienteId
      });
    }

    // Verifique se já existe uma máquina com os dados fornecidos
    const maquinaExistente = await prisma.pix_Maquina.findFirst({
      where: {
        OR: condicoes
      },
      select: {
        id: true, // Retorna o ID da máquina conflitante
        nome: true, // Retorna o nome da máquina conflitante
        store_id: true, // Retorna o store_id da máquina conflitante
        maquininha_serial: true // Retorna o maquininha_serial da máquina conflitante
      }
    });

    if (maquinaExistente) {
      return res.status(400).json({
        error: `Já existe uma máquina com o nome (${maquinaExistente.nome}), store_id (${maquinaExistente.store_id}) ou maquininha_serial (${maquinaExistente.maquininha_serial}) para este cliente.`,
      });
    }

    // Cria a nova máquina, caso não haja conflitos
    const maquina = await prisma.pix_Maquina.create({ data: req.body });

    return res.json(maquina);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `Erro ao criar a máquina: ${err.message}` });
  }
});



app.put('/recuperar-id-maquina/:id', verifyJwtPessoa, async (req, res) => {
  const { id } = req.params;
  const { novoId } = req.body;

  try {
    // Verifica se a máquina com o ID atual existe
    const maquinaExistente = await prisma.pix_Maquina.findUnique({
      where: { id },
    });

    if (!maquinaExistente) {
      return res.status(404).json({ error: 'Máquina não encontrada' });
    }

    // Atualiza o ID da máquina
    const maquinaAtualizada = await prisma.pix_Maquina.update({
      where: { id },
      data: { id: novoId },
    });

    res.json({ message: 'ID da máquina atualizado com sucesso', maquina: maquinaAtualizada });
  } catch (error) {
    console.error('Erro ao alterar o ID da máquina:', error);
    res.status(500).json({ error: 'Erro ao alterar o ID da máquina' });
  }
});

//alterar máquina
app.put("/maquina", verifyJwtPessoa, async (req: any, res) => {
  try {
    // Verifique se já existe uma máquina com o mesmo nome, store_id ou maquininha_serial para este cliente, mas exclua a máquina atual
    const maquinaExistente = await prisma.pix_Maquina.findFirst({
      where: {
        AND: [
          { clienteId: req.body.clienteId }, // Filtra pelo cliente
          {
            OR: [
              { nome: req.body.nome },
              { store_id: req.body.store_id },
              { maquininha_serial: req.body.maquininha_serial }
            ]
          },
          { NOT: { id: req.body.id } } // Exclui a máquina atual da verificação
        ]
      },
      select: {
        id: true,
        nome: true,
        store_id: true,
        maquininha_serial: true
      }
    });

    if (maquinaExistente) {
      return res.status(400).json({
        error: `Já existe uma máquina com o nome (${maquinaExistente.nome}), store_id (${maquinaExistente.store_id}) ou maquininha_serial (${maquinaExistente.maquininha_serial}) para este cliente.`
      });
    }

    // Se não houver conflitos, atualiza a máquina
    const maquinaAtualizada = await prisma.pix_Maquina.update({
      where: {
        id: req.body.id,
      },
      data: {
        nome: req.body.nome,
        descricao: req.body.descricao,
        store_id: req.body.store_id,
        maquininha_serial: req.body.maquininha_serial,
        valorDoPulso: req.body.valorDoPulso,
        estoque: req.body.estoque
        // Adicione outros campos conforme necessário
      },
    });

    console.log('Máquina atualizada com sucesso:', maquinaAtualizada);

    return res.status(200).json(maquinaAtualizada);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `Erro ao atualizar a máquina: ${err.message}` });
  }
});

//alterar máquina CLIENTE
app.put("/maquina-cliente", verifyJWT, async (req: any, res) => {
  try {
    // Verifique se já existe uma máquina com o mesmo nome, store_id ou maquininha_serial para este cliente, mas exclua a máquina atual
    const maquinaExistente = await prisma.pix_Maquina.findFirst({
      where: {
        AND: [
          { clienteId: req.body.clienteId }, // Filtra pelo cliente
          {
            OR: [
              { nome: req.body.nome },
              { store_id: req.body.store_id },
              { maquininha_serial: req.body.maquininha_serial }
            ]
          },
          { NOT: { id: req.body.id } } // Exclui a máquina atual da verificação
        ]
      },
      select: {
        id: true,
        nome: true,
        store_id: true,
        maquininha_serial: true
      }
    });

    if (maquinaExistente) {
      return res.status(400).json({
        error: `Já existe uma máquina com o nome (${maquinaExistente.nome}), store_id (${maquinaExistente.store_id}) ou maquininha_serial (${maquinaExistente.maquininha_serial}) para este cliente.`
      });
    }

    // Se não houver conflitos, atualiza a máquina
    const maquinaAtualizada = await prisma.pix_Maquina.update({
      where: {
        id: req.body.id,
      },
      data: {
        nome: req.body.nome,
        descricao: req.body.descricao,
        valorpoint: req.body.valorpoint,
        tokenpoint: req.body.tokenpoint,
        informacao: req.body.informacao,
        estado: req.body.estado,
        nomepoint: req.body.nomepoint,
        whatsapp: req.body.whatsapp,
        apikey: req.body.apikey,
        store_id: req.body.store_id,
        valorDoPulso: req.body.valorDoPulso,
        probabilidade: req.body.probabilidade,
        garraforte: req.body.garraforte,
        contadorcreditobaixo: req.body.contadorcreditobaixo,
        estoquebaixo: req.body.estoquebaixo,
        contadorcredito: req.body.contadorcredito,
        contadorpelucia: req.body.contadorpelucia,
        estoque: req.body.estoque,
        estoque2: req.body.estoque2,
        estoque3: req.body.estoque3,
        estoque4: req.body.estoque4,
        estoque5: req.body.estoque5
        // Adicione outros campos conforme necessário
      },
    });

    console.log('Máquina atualizada com sucesso:', maquinaAtualizada);

    return res.status(200).json(maquinaAtualizada);
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `Erro ao atualizar a máquina: ${err.message}` });
  }
});

//DELETAR MÁQUINA ADM
app.delete("/maquina", verifyJwtPessoa, async (req: any, res) => {
  try {

    if (!req.body.id) {
      return res.status(500).json({ error: `>>:informe o id da máquina que deseja deletar` });
    }

    const deletedPagamento = await prisma.pix_Pagamento.deleteMany({
      where: {
        maquinaId: req.body.id,
      },
    });

    const deletedMaquina = await prisma.pix_Maquina.delete({
      where: {
        id: req.body.id,
      },
    });

    if (deletedMaquina) {
      console.log('Máquina removida com sucesso:', deletedMaquina.nome);
      return res.status(200).json(`Máquina: ${deletedMaquina.nome} removida.`);
    } else {
      return res.status(200).json(`Máquina não encontrada.`);
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>>:${err.message}` });
  }
});


//DELETAR MÁQUINA....
app.delete("/maquina-cliente", verifyJWT, async (req: any, res) => {
  try {

    if (!req.body.id) {
      return res.status(500).json({ error: `>>:informe o id da máquina que deseja deletar` });
    }

    const deletedPagamento = await prisma.pix_Pagamento.deleteMany({
      where: {
        maquinaId: req.body.id,
      },
    });

    const deletedMaquina = await prisma.pix_Maquina.delete({
      where: {
        id: req.body.id,
      },
    });

    if (deletedMaquina) {
      console.log('Máquina removida com sucesso:', deletedMaquina.nome);
      return res.status(200).json(`Máquina: ${deletedMaquina.nome} removida.`);
    } else {
      return res.status(200).json(`Máquina não encontrada.`);
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ error: `>>:${err.message}` });
  }
});


app.get("/consultar-maquina/:id", async (req: any, res) => {
  //console.log(`${req.userId} acessou a dashboard.`);

  try {

    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      }
    });

    var pulsosFormatados = "";

    if (maquina != null) {
      pulsosFormatados = converterPixRecebidoDinamico(parseFloat(maquina.valorDoPix), parseFloat(maquina.valorDoPulso));

      console.log("encontrou"); //zerar o valor e atualizar data ultimo acesso

      await prisma.pix_Maquina.update({
        where: {
          id: req.params.id
        },
        data: {
          valorDoPix: "0",
          ultimaRequisicao: new Date(Date.now())
        }
      })

    } else {
      pulsosFormatados = "0000";
      console.log("não encontrou");
    }

    return res.status(200).json({ "retorno": pulsosFormatados });

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "0000" });
  }
});

//SIMULA UM CRÉDITO REMOTO
app.post("/credito-remoto", verifyJwtPessoa, async (req: any, res) => {

  try {

    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.body.id,
      },
      include: {
        cliente: true,
      },
    });

    //VERIFICANDO SE A MÁQUINA PERTENCE A UM CIENTE ATIVO 
    if (maquina != null) {
      if (maquina.cliente !== null && maquina.cliente !== undefined) {
        if (maquina.cliente.ativo) {
          console.log("Cliente ativo - seguindo...");
        } else {
          console.log("Cliente inativo - parando...");
          return res.status(500).json({ "retorno": `CLIENTE ${maquina.cliente.nome} INATIVO` });
        }
      } else {
        console.log("error.. cliente nulo!");
      }

      //VERIFICAR SE A MAQUINA ESTA ONINE
      if (maquina.ultimaRequisicao) {
        var status = (tempoOffline(new Date(maquina.ultimaRequisicao))) > 60 ? "OFFLINE" : "ONLINE";
        console.log(status);
        if (status == "OFFLINE") {
          return res.status(400).json({ "msg": "MÁQUINA OFFLINE!" });
        }
      } else {
        return res.status(400).json({ "msg": "MÁQUINA OFFLINE!" });
      }

      await prisma.pix_Maquina.update({
        where: {
          id: req.body.id
        },
        data: {
          valorDoPix: req.body.valor,
          ultimoPagamentoRecebido: new Date(Date.now())
        }
      });

      if (NOTIFICACOES_CREDITO_REMOTO) {
        notificarDiscord(NOTIFICACOES_CREDITO_REMOTO, `CRÉDITO REMOTO DE R$: ${req.body.valor}`, `Enviado pelo adm.`)
      }

      return res.status(200).json({ "retorno": "CREDITO INSERIDO" });

    } else {
      console.log("não encontrou");
      return res.status(301).json({ "retorno": "ID NÃO ENCONTRADO" });
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO: see: console > view logs" });
  }
});

//SIMULA UM CRÉDITO REMOTO
app.post("/credito-remoto-cliente", verifyJWT, async (req: any, res) => {

  try {

    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.body.id,
      },
      include: {
        cliente: true,
      },
    });


    //VERIFICANDO SE A MÁQUINA PERTENCE A UM CIENTE ATIVO 
    if (maquina != null) {
      if (maquina.cliente !== null && maquina.cliente !== undefined) {
        if (maquina.cliente.ativo) {
          console.log("Cliente ativo - seguindo...");
        } else {
          console.log("Cliente inativo - parando...");
          return res.status(500).json({ "retorno": `CLIENTE ${maquina.cliente.nome} INATIVO` });
        }
      } else {
        console.log("error.. cliente nulo!");
      }

      //VERIFICAR SE A MAQUINA ESTA ONINE
      if (maquina.ultimaRequisicao) {
        var status = (tempoOffline(new Date(maquina.ultimaRequisicao))) > 60 ? "OFFLINE" : "ONLINE";
        console.log(status);
        if (status == "OFFLINE") {
          return res.status(400).json({ "msg": "MÁQUINA OFFLINE!" });
        }
      } else {
        return res.status(400).json({ "msg": "MÁQUINA OFFLINE!" });
      }


      await prisma.pix_Maquina.update({
        where: {
          id: req.body.id
        },
        data: {
          valorDoPix: req.body.valor,
          ultimoPagamentoRecebido: new Date(Date.now())
        }
      });

      if (NOTIFICACOES_CREDITO_REMOTO) {
        notificarDiscord(NOTIFICACOES_CREDITO_REMOTO, `CRÉDITO REMOTO DE R$: ${req.body.valor}`, `Enviado pelo cliente.`)
      }

      return res.status(200).json({ "retorno": "CREDITO INSERIDO" });

    } else {
      console.log("não encontrou");
      return res.status(301).json({ "retorno": "ID NÃO ENCONTRADO" });
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO: see: console > view logs" });
  }
});

//login ADM 
app.post("/login-pessoa", async (req, res) => {
  try {
    const user = await prisma.pix_Pessoa.findUnique({
      where: {
        email: req.body.email
      },
    })

    if (!user) {
      throw new Error('Password or Email Invalid');
    }

    // check user password with hashed password stored in the database
    const validPassword = await bcrypt.compare(req.body.senha, user.senha);

    if (!validPassword) {
      throw new Error('Password or Email Invalid');
    }

    await prisma.pix_Pessoa.update({
      where: {
        email: req.body.email
      },
      data: { ultimoAcesso: new Date(Date.now()) }
    })

    //explicação top sobre jwt https://www.youtube.com/watch?v=D0gpL8-DVrc
    const token = jwt.sign({ userId: user.id }, SECRET_PESSOA, { expiresIn: 3600 }); //5min = 300 para 1h = 3600

    if (NOTIFICACOES_LOGINS) {
      notificarDiscord(NOTIFICACOES_LOGINS, "Novo login efetuado", `ADM ${user.nome} acabou de fazer login.`)
    }


    return res.json({ email: user.email, id: user.id, type: "pessoa", key: "ADMIN", name: user.nome, lastLogin: user.ultimoAcesso, token });
  } catch (error) {

    const { message } = error as Error;

    return res.status(403).json({ error: message });
  }
});
//

//login-cliente
app.post("/login-cliente", async (req, res) => {
  try {
    const user = await prisma.pix_Cliente.findUnique({
      where: {
        email: req.body.email
      },
    })

    if (!user) {
      throw new Error('Password or Email Invalid');
    }

    // check user password with hashed password stored in the database
    const validPassword = await bcrypt.compare(req.body.senha, user.senha);

    if (!validPassword) {
      throw new Error('Password or Email Invalid');
    }

    await prisma.pix_Cliente.update({
      where: {
        email: req.body.email
      },
      data: { ultimoAcesso: new Date(Date.now()) }
    })

    //explicação top sobre jwt https://www.youtube.com/watch?v=D0gpL8-DVrc
    const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: 3600 }); //5min = 300 para 1h = 3600

    var warningMsg = "";

    if (user) {
      if (user.dataVencimento) {
        const diferencaEmMilissegundos = new Date().getTime() - user.dataVencimento.getTime();
        const diferencaEmDias = Math.floor(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));
        console.log("atraso: " + diferencaEmDias);
        if (diferencaEmDias > 0 && diferencaEmDias <= 5) {
          warningMsg = `Atenção! Regularize seu pagamento!`
        }
        if (diferencaEmDias > 5 && diferencaEmDias <= 10) {
          warningMsg = `seu plano será bloqueado em  ${diferencaEmDias} dia(s), efetue pagamento e evite o bloqueio.`
        }
        if (diferencaEmDias > 10) {
          warningMsg = `seu plano está bloqueado, entre em contato com o setor financeiro!`
        }
      }
    }

    if (NOTIFICACOES_LOGINS) {
      notificarDiscord(NOTIFICACOES_LOGINS, "Novo login efetuado", `Cliente ${user.nome} acabou de fazer login.`)
    }

    return res.json({ email: user.email, id: user.id, type: "pessoa", key: "CLIENT", name: user.nome, lastLogin: user.ultimoAcesso, ativo: user.ativo, warningMsg: warningMsg, vencimento: user.dataVencimento, token });
  } catch (error) {

    const { message } = error as Error;

    return res.status(403).json({ error: message });
  }
});


//maquinas exibir as máquinas de um cliente logado
app.get("/maquinas", verifyJWT, async (req: any, res) => {

  console.log(`${req.userId} acessou a rota que busca todos as máquinas.`);

  try {

    const maquinas = await prisma.pix_Maquina.findMany({
      where: {
        clienteId: req.userId,
      },
      orderBy: {
        dataInclusao: 'desc', // 'asc' para ordenação ascendente, 'desc' para ordenação descendente.
      },
    });

    if (maquinas != null) {
      console.log("encontrou");

      const maquinasComStatus = [];

      for (const maquina of maquinas) {
        // 60 segundos sem acesso máquina já fica offline
        if (maquina.ultimaRequisicao) {
          var status = (tempoOffline(new Date(maquina.ultimaRequisicao))) > 60 ? "OFFLINE" : "ONLINE";

          //60 segundos x 30 = 1800 segundos (meia hora pagamento mais recente)
          if (status == "ONLINE" && maquina.ultimoPagamentoRecebido && tempoOffline(new Date(maquina.ultimoPagamentoRecebido)) < 1800) {
            status = "PAGAMENTO_RECENTE";
          }

          maquinasComStatus.push({
            id: maquina.id,
            pessoaId: maquina.pessoaId,
            clienteId: maquina.clienteId,
            nome: maquina.nome,
            descricao: maquina.descricao,
            estado: maquina.estado,
            probabilidade: maquina.probabilidade,
            garraforte: maquina.garraforte,
            contadorcredito: maquina.contadorcredito,
            contadorpelucia: maquina.contadorpelucia,
            contadorcreditobaixo: maquina.contadorcreditobaixo,
            estoquebaixo: maquina.estoquebaixo,
            estoque: maquina.estoque,
            estoque2: maquina.estoque2,
            estoque3: maquina.estoque3,
            estoque4: maquina.estoque4,
            estoque5: maquina.estoque5,
            store_id: maquina.store_id,
            valorDoPix: maquina.valorDoPix,
            dataInclusao: maquina.dataInclusao,
            ultimoPagamentoRecebido: maquina.ultimoPagamentoRecebido,
            ultimaRequisicao: maquina.ultimaRequisicao,
            status: status,
            pulso: maquina.valorDoPulso,
            maquininha_serial: maquina.maquininha_serial,
          });
        } else {
          maquinasComStatus.push({
            maquininha_serial: maquina.maquininha_serial,
            id: maquina.id,
            pessoaId: maquina.pessoaId,
            clienteId: maquina.clienteId,
            nome: maquina.nome,
            descricao: maquina.descricao,
            estado: maquina.estado,
            probabilidade: maquina.probabilidade,
            garraforte: maquina.garraforte,
            contadorcredito: maquina.contadorcredito,
            contadorpelucia: maquina.contadorpelucia,
            contadorcreditobaixo: maquina.contadorcreditobaixo,
            estoquebaixo: maquina.estoquebaixo,
            estoque: maquina.estoque,
            estoque2: maquina.estoque2,
            estoque3: maquina.estoque3,
            estoque4: maquina.estoque4,
            estoque5: maquina.estoque5,
            store_id: maquina.store_id,
            valorDoPix: maquina.valorDoPix,
            dataInclusao: maquina.dataInclusao,
            ultimoPagamentoRecebido: maquina.ultimoPagamentoRecebido,
            ultimaRequisicao: maquina.ultimaRequisicao,
            status: "OFFLINE",
            pulso: maquina.valorDoPulso
          });
        }
      }

      return res.status(200).json(maquinasComStatus);

    } else {
      console.log("não encontrou");
      return res.status(200).json("[]");
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});


app.get("/maquinas-adm", verifyJwtPessoa, async (req: any, res) => {

  try {

    const maquinas = await prisma.pix_Maquina.findMany({
      where: {
        clienteId: req.query.id,
      },
      orderBy: {
        dataInclusao: 'desc', // 'asc' para ordenação ascendente, 'desc' para ordenação descendente.
      },
    });

    if (maquinas != null) {
      console.log("encontrou");

      const maquinasComStatus = [];

      for (const maquina of maquinas) {
        // 60 segundos sem acesso máquina já fica offline
        if (maquina.ultimaRequisicao) {
          var status = (tempoOffline(new Date(maquina.ultimaRequisicao))) > 60 ? "OFFLINE" : "ONLINE";

          //60 segundos x 30 = 1800 segundos (meia hora pagamento mais recente)
          if (status == "ONLINE" && maquina.ultimoPagamentoRecebido && tempoOffline(new Date(maquina.ultimoPagamentoRecebido)) < 1800) {
            status = "PAGAMENTO_RECENTE";
          }

          maquinasComStatus.push({
            id: maquina.id,
            pessoaId: maquina.pessoaId,
            clienteId: maquina.clienteId,
            nome: maquina.nome,
            descricao: maquina.descricao,
            estoque: maquina.estoque,
            store_id: maquina.store_id,
            maquininha_serial: maquina.maquininha_serial,
            valorDoPix: maquina.valorDoPix,
            dataInclusao: maquina.dataInclusao,
            ultimoPagamentoRecebido: maquina.ultimoPagamentoRecebido,
            ultimaRequisicao: maquina.ultimaRequisicao,
            status: status,
            pulso: maquina.valorDoPulso
          });
        } else {
          maquinasComStatus.push({
            id: maquina.id,
            pessoaId: maquina.pessoaId,
            clienteId: maquina.clienteId,
            nome: maquina.nome,
            descricao: maquina.descricao,
            estoque: maquina.estoque,
            store_id: maquina.store_id,
            maquininha_serial: maquina.maquininha_serial,
            valorDoPix: maquina.valorDoPix,
            dataInclusao: maquina.dataInclusao,
            ultimoPagamentoRecebido: maquina.ultimoPagamentoRecebido,
            ultimaRequisicao: maquina.ultimaRequisicao,
            status: "OFFLINE",
            pulso: maquina.valorDoPulso
          });
        }
      }

      return res.status(200).json(maquinasComStatus);

    } else {
      console.log("não encontrou");
      return res.status(200).json("[]");
    }

  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});

app.get("/clientes", verifyJwtPessoa, async (req: any, res) => {
  console.log(`${req.userId} acessou a rota que busca todos os clientes e suas máquinas.`);
  try {
    const clientesComMaquinas = await prisma.pix_Cliente.findMany({
      where: {
        pessoaId: req.userId,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        dataInclusao: true,
        ultimoAcesso: true,
        ativo: true,
        senha: false,
        mercadoPagoToken: true,
        pagbankEmail: true,
        pagbankToken: true, // Adiciona o pagbankToken
        dataVencimento: true,
        Maquina: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            store_id: true,
            dataInclusao: true,
            ultimoPagamentoRecebido: true,
            ultimaRequisicao: true,
            maquininha_serial: true, // Adiciona maquininha_serial
          },
        },
      },
      orderBy: {
        dataInclusao: 'desc', // Ordenar pela dataInclusao do mais atual para o mais antigo
      },
    });

    if (clientesComMaquinas != null) {
      console.log("retornando a lista de clientes e suas respectivas máquinas");

      // Modificando os campos mercadoPagoToken e pagbankToken
      const clientesModificados = clientesComMaquinas.map(cliente => ({
        ...cliente,
        mercadoPagoToken: cliente.mercadoPagoToken ? "***********" + cliente.mercadoPagoToken.slice(-3) : null,
        pagbankToken: cliente.pagbankToken ? "***********" + cliente.pagbankToken.slice(-3) : null, // Oculta o pagbankToken
      }));

      return res.status(200).json(clientesModificados);
    } else {
      console.log("não encontrou");
      return res.status(200).json("[]");
    }
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});

app.post("/ativar-cliente", verifyJwtPessoa, async (req, res) => {
  try {
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.body.clienteId
      },
    })

    if (!cliente) {
      throw new Error('Client not found');
    }

    await prisma.pix_Cliente.update({
      where: {
        id: req.body.clienteId
      },
      data: {
        ativo: true
      }
    });

    return res.status(200).json({ "retorno": `CLIENTE ${cliente.nome} DESBLOQUEADO` });
  } catch (error) {

    const { message } = error as Error;

    return res.status(403).json({ error: message });
  }
});

app.post("/inativar-cliente", verifyJwtPessoa, async (req, res) => {
  try {
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.body.clienteId
      },
    })

    if (!cliente) {
      throw new Error('Client not found');
    }

    await prisma.pix_Cliente.update({
      where: {
        id: req.body.clienteId
      },
      data: {
        ativo: false
      }
    });

    return res.status(200).json({ "retorno": `CLIENTE ${cliente.nome} BLOQUEADO` });
  } catch (error) {

    const { message } = error as Error;

    return res.status(403).json({ error: message });
  }
});

async function verificarRegistroExistente(mercadoPagoId: string, maquinaId: string) {
  try {
    // Verificar se já existe um registro com os campos especificados
    const registroExistente = await prisma.pix_Pagamento.findFirst({
      where: {
        mercadoPagoId: mercadoPagoId,
        maquinaId: maquinaId,
      },
    });

    if (registroExistente) {
      // Se um registro com os campos especificados existe, retorna true
      return true;
    } else {
      // Se não existir nenhum registro com os campos especificados, retorna false
      return false;
    }
  } catch (error) {
    console.error('Erro ao verificar o registro:', error);
    throw new Error('Erro ao verificar o registro.');
  }
}

//esse id é o do cliente e NÃO DA máquina.
//EXEMPLO:
//https://api-v3-ddd5b551a51f.herokuapp.com/rota-recebimento-mercado-pago-dinamica/a803e2f8-7045-4ae8-a387-517ae844c965
app.post("/rota-recebimento-mercado-pago-dinamica/:id", async (req: any, res: any) => {

  try {

    //teste de chamada do Mercado Pago
    if (req.query.id === "123456") {
      return res.status(200).json({ "status": "ok" });
    }

    var valor = 0.00;
    var tipoPagamento = ``;
    var taxaDaOperacao = ``;
    var cliId = ``;
    var str_id = "";
    var mensagem = `MÁQUINA NÃO POSSUI store_id CADASTRADO > 
    ALTERE O store_id dessa máquina para ${str_id} para poder receber pagamentos nela...`;


    console.log("Novo pix do Mercado Pago:");
    console.log(req.body);

    console.log("id");
    console.log(req.query.id);

    const { resource, topic } = req.body;

    // Exibe os valores capturados
    console.log('Resource:', resource);
    console.log('Topic:', topic);

    var url = "https://api.mercadopago.com/v1/payments/" + req.query.id;

    var tokenCliente = "";

    //buscar token do cliente no banco de dados:
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.params.id,
      }
    });

    tokenCliente = (cliente?.mercadoPagoToken == undefined) ? "" : cliente?.mercadoPagoToken;
    cliId = (cliente?.id == undefined) ? "" : cliente?.id;

    if (tokenCliente) {
      console.log("token obtido.");
    }

    console.log("Cliente ativo:");
    console.log(cliente?.ativo);



    axios.get(url, { headers: { Authorization: `Bearer ${tokenCliente}` } })
      .then(async (response: { data: { store_id: string; transaction_amount: number; status: string, payment_type_id: string, fee_details: any }; }) => {

        console.log('store_id', response.data.store_id);
        str_id = response.data.store_id;
        console.log('storetransaction_amount_id', response.data.transaction_amount);
        console.log('payment_method_id', response.data.payment_type_id);
        valor = response.data.transaction_amount;
        tipoPagamento = response.data.payment_type_id;

        if (response.data.fee_details && Array.isArray(response.data.fee_details) && response.data.fee_details.length > 0) {
          console.log('Amount:', response.data.fee_details[0].amount);
          taxaDaOperacao = response.data.fee_details[0].amount + "";
        }

        //BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (store_id)
        const maquina = await prisma.pix_Maquina.findFirst({
          where: {
            store_id: str_id,
            clienteId: req.params.id
          },
          include: {
            cliente: true,
          },
        });

        console.log("store id trazido pelo Mercado Pago...");
        console.log(str_id);



        //PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
        if (maquina && maquina.store_id && maquina.store_id.length > 0) {

          console.log(`recebendo pagamento na máquina: ${maquina.nome} - store_id: ${maquina.store_id}`)

          //VERIFICANDO SE A MÁQUINA PERTENCE A UM CIENTE ATIVO 
          if (cliente != null) {
            if (cliente !== null && cliente !== undefined) {
              if (cliente.ativo) {
                console.log("Cliente ativo - seguindo...");

                //VERIFICAÇÃO DA DATA DE VENCIMENTO:
                if (cliente.dataVencimento) {
                  if (cliente.dataVencimento != null) {
                    console.log("verificando inadimplência...");
                    const dataVencimento: Date = cliente.dataVencimento;
                    const dataAtual = new Date();
                    const diferencaEmMilissegundos = dataAtual.getTime() - dataVencimento.getTime();
                    const diferencaEmDias = Math.floor(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));
                    console.log(diferencaEmDias);
                    if (diferencaEmDias > 10) {
                      console.log("Cliente MENSALIDADE atrasada - estornando...");

                      //EVITAR ESTORNO DUPLICADO
                      const registroExistente = await prisma.pix_Pagamento.findFirst({
                        where: {
                          mercadoPagoId: req.query.id,
                          estornado: true,
                          clienteId: req.params.id
                        },
                      });

                      if (registroExistente) {
                        console.log("Esse estorno ja foi feito...");
                        return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                      } else {
                        console.log("Seguindo...");
                      }
                      //FIM EVITANDO ESTORNO DUPLICADO

                      estornarMP(req.query.id, tokenCliente, "mensalidade com atraso");
                      //REGISTRAR O PAGAMENTO
                      const novoPagamento = await prisma.pix_Pagamento.create({
                        data: {
                          maquinaId: maquina.id,
                          valor: valor.toString(),
                          mercadoPagoId: req.query.id,
                          motivoEstorno: `01- mensalidade com atraso. str_id: ${str_id}`,
                          estornado: true,
                        },
                      });
                      return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                    }
                  }
                  else {
                    console.log("pulando etapa de verificar inadimplência... campo dataVencimento não cadastrado ou nulo!")
                  }
                }
                //FIM VERIFICAÇÃO VENCIMENTO

              } else {
                console.log("Cliente inativo - estornando...");

                //EVITAR ESTORNO DUPLICADO
                const registroExistente = await prisma.pix_Pagamento.findFirst({
                  where: {
                    mercadoPagoId: req.query.id,
                    estornado: true,
                    clienteId: req.params.id
                  },
                });

                if (registroExistente) {
                  console.log("Esse estorno ja foi feito...");
                  return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                } else {
                  console.log("Seguindo...");
                }
                //FIM EVITANDO ESTORNO DUPLICADO

                estornarMP(req.query.id, tokenCliente, "cliente inativo");
                //REGISTRAR O PAGAMENTO
                const novoPagamento = await prisma.pix_Pagamento.create({
                  data: {
                    maquinaId: maquina.id,
                    valor: valor.toString(),
                    mercadoPagoId: req.query.id,
                    motivoEstorno: `02- cliente inativo. str_id: ${str_id}`,
                    estornado: true,
                  },
                });
                return res.status(200).json({ "retorno": "error.. cliente INATIVO - pagamento estornado!" });
              }
            } else {
              console.log("error.. cliente nulo ou não encontrado!");
              return res.status(200).json({ "retorno": "error.. cliente nulo ou não encontrado!" });
            }
          }
          //FIM VERIFICAÇÃO DE CLIENTE ATIVO.

          //VERIFICANDO SE A MÁQUINA ESTÁ OFFLINE 
          if (maquina.ultimaRequisicao instanceof Date) {
            const diferencaEmSegundos = tempoOffline(maquina.ultimaRequisicao);
            if (diferencaEmSegundos > 60) {
              console.log("estornando... máquina offline.");

              //EVITAR ESTORNO DUPLICADO
              const registroExistente = await prisma.pix_Pagamento.findFirst({
                where: {
                  mercadoPagoId: req.query.id,
                  estornado: true,
                },
              });

              if (registroExistente) {
                console.log("Esse estorno ja foi feito...");
                return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
              } else {
                console.log("Seguindo...");
              }
              //FIM EVITANDO ESTORNO DUPLICADO

              estornarMP(req.query.id, tokenCliente, "máquina offline");
              //evitando duplicidade de estorno:
              const estornos = await prisma.pix_Pagamento.findMany({
                where: {
                  mercadoPagoId: req.query.id,
                  estornado: true,
                  clienteId: req.params.id
                },
              });

              if (estornos) {
                if (estornos.length > 0) {
                  return res.status(200).json({ "retorno": "PAGAMENTO JÁ ESTORNADO! - MÁQUINA OFFLINE" });
                }
              }
              //FIM envitando duplicidade de estorno
              //REGISTRAR ESTORNO
              const novoPagamento = await prisma.pix_Pagamento.create({
                data: {
                  maquinaId: maquina.id,
                  valor: valor.toString(),
                  mercadoPagoId: req.query.id,
                  motivoEstorno: `03- máquina offline. str_id: ${str_id}`,
                  estornado: true,
                },
              });
              return res.status(200).json({ "retorno": "PAGAMENTO ESTORNADO - MÁQUINA OFFLINE" });
            }
          } else {
            console.log("estornando... máquina offline.");

            //EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: req.query.id,
                estornado: true,
                clienteId: req.params.id
              },
            });

            if (registroExistente) {
              console.log("Esse estorno ja foi feito...");
              return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
            } else {
              console.log("Seguindo...");
            }
            //FIM EVITANDO ESTORNO DUPLICADO

            estornarMP(req.query.id, tokenCliente, "máquina offline");
            //REGISTRAR O PAGAMENTO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: valor.toString(),
                mercadoPagoId: req.query.id,
                motivoEstorno: `04- máquina offline. str_id: ${str_id}`,
                estornado: true,
              },
            });
            return res.status(200).json({ "retorno": "PAGAMENTO ESTORNADO - MÁQUINA OFFLINE" });
          }
          //FIM VERIFICAÇÃO MÁQUINA OFFLINE

          //VERIFICAR SE O VALOR PAGO É MAIOR QUE O VALOR MÍNIMO

          const valorMinimo = parseFloat(maquina.valorDoPulso);
          if (valor < valorMinimo) {
            console.log("iniciando estorno...")

            //EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: req.query.id,
                estornado: true,
                clienteId: req.params.id
              },
            });

            if (registroExistente) {
              console.log("Esse estorno ja foi feito...");
              return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
            } else {
              console.log("Seguindo...");
            }
            //FIM EVITANDO ESTORNO DUPLICADO


            //REGISTRAR O PAGAMENTO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: valor.toString(),
                mercadoPagoId: req.query.id,
                motivoEstorno: `05- valor inferior ao mínimo. str_id: ${str_id}`,
                estornado: true,
              },
            });
            console.log("estornando valor inferior ao mínimo...");

            estornarMP(req.query.id, tokenCliente, "valor inferior ao mínimo");
            return res.status(200).json({
              "retorno": `PAGAMENTO ESTORNADO - INFERIOR AO VALOR 
            MÍNIMO DE R$: ${valorMinimo} PARA ESSA MÁQUINA.`
            });
          } else {
            console.log("valor permitido finalizando operação...");
          }

          if (response.data.status != "approved") {
            console.log("pagamento não aprovado!");
            return;
          }

          //VERIFICAR SE ESSE PAGAMENTO JÁ FOI EFETUADO
          const registroExistente = await prisma.pix_Pagamento.findFirst({
            where: {
              mercadoPagoId: req.query.id,
              clienteId: req.params.id
            },
          });

          if (registroExistente) {
            console.log("Esse pagamento ja foi feito...");
            return res.status(200).json({ "retorno": "error.. Duplicidade de pagamento!" });
          } else {
            console.log("Seguindo...");
          }
          //VERIFICAR SE ESSE PAGAMENTO JÁ FOI EFETUADO

          //ATUALIZAR OS DADOS DA MÁQUINA QUE ESTAMOS RECEBENDO O PAGAMENTO
          await prisma.pix_Maquina.update({
            where: {
              id: maquina.id,
            },
            data: {
              valorDoPix: valor.toString(),
              ultimoPagamentoRecebido: new Date(Date.now())
            }
          });

          //REGISTRAR O PAGAMENTO
          const novoPagamento = await prisma.pix_Pagamento.create({
            data: {
              maquinaId: maquina.id,
              valor: valor.toString(),
              mercadoPagoId: req.query.id,
              motivoEstorno: ``,
              tipo: tipoPagamento,
              taxas: taxaDaOperacao,
              clienteId: cliId,
              estornado: false,
              operadora: `Mercado Pago`
            },
          });

          if (NOTIFICACOES_PAGAMENTOS) {
            notificarDiscord(NOTIFICACOES_PAGAMENTOS, `Novo pagamento recebido no Mercado Pago. R$: ${valor.toString()}`, `Cliente ${cliente?.nome} Maquina: ${maquina?.nome}. Maquina: ${maquina?.descricao}`)
          }

          console.log('Pagamento inserido com sucesso:', novoPagamento);
          return res.status(200).json(novoPagamento);

        } else {

          //PROCESSAMENTO DE EVENTOS QUE NÃO SAO PAYMENTS DE LOJAS E CAIXAS


          console.log(mensagem);
          return res.status(200).json({ "retorno": mensagem });
        }


      }).catch((error: any) => {
        console.error('Erro ao processar pagamento, verifique se o token está cadastrado:', error);
        // Aqui você pode adicionar qualquer lógica ou retorno desejado em caso de erro.
        return res.status(500).json({ error: `${error.message}` });
      });

  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "error: " + error });
  }
});


//esse :id é o do seu cliente e não da máquina!
//EXEMPLO:
//https://api-v3-ddd5b551a51f.herokuapp.com/webhookmercadopago/a803e2f8-7045-4ae8-a387-517ae844c965
app.post("/webhookmercadopago/:id", async (req: any, res: any) => {

  try {

    console.log("Processando pagamento via Mercado Pago Webhooks...");

    console.log(req.body);

    //teste de chamada do Mercado Pago (webhooks)
    if (req.query['data.id'] === "123456" && req.query.type === "payment") {
      console.log("recebendo requisição de teste do Mercado Pago");

      console.log("Ip de origem");
      const ip = req.socket.remoteAddress;
      // Se estiver por trás de um proxy, use o cabeçalho 'x-forwarded-for'
      const ipFromHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      console.log(ipFromHeader);

      return res.status(200).json({ "status": "ok" });
    }

    /*

    //processamento do pagamento
    var valor = 0.00;
    var tipoPagamento = ``;
    var taxaDaOperacao = ``;
    var cliId = ``;
    var str_id = "";
    var mensagem = `MÁQUINA NÃO ENCONTRADA`;


    console.log("Novo pix do Mercado Pago:");
    console.log(req.body);

    console.log("id");
    console.log(req.query['data.id']);

    const { resource, topic } = req.body;

    // Exibe os valores capturados
    console.log('Resource:', resource);
    console.log('Topic:', topic);

    var url = "https://api.mercadopago.com/v1/payments/" + req.query['data.id'];

    var tokenCliente = "";

    //buscar token do cliente no banco de dados:
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.params.id,
      }
    });

    tokenCliente = (cliente?.mercadoPagoToken == undefined) ? "" : cliente?.mercadoPagoToken;
    cliId = (cliente?.id == undefined) ? "" : cliente?.id;

    if (tokenCliente) {
      console.log("token obtido.");
    }

    console.log("Cliente ativo:");
    console.log(cliente?.ativo);



    axios.get(url, { headers: { Authorization: `Bearer ${tokenCliente}` } })
      .then(async (response: { data: {transaction_amount: number; status: string, payment_type_id: string, fee_details: any, external_reference: string }; }) => {

        console.log('storetransaction_amount_id', response.data.transaction_amount);

        console.log('payment_method_id', response.data.payment_type_id);

        valor = response.data.transaction_amount;

        tipoPagamento = response.data.payment_type_id;

        console.log('external_reference', response.data.external_reference);

        if (response.data.fee_details && Array.isArray(response.data.fee_details) && response.data.fee_details.length > 0) {
          console.log('Amount:', response.data.fee_details[0].amount);
          taxaDaOperacao = response.data.fee_details[0].amount + "";
        }

        //BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (store_id)
        const maquina = await prisma.pix_Maquina.findFirst({
          where: {
            id: response.data.external_reference,
          },
          include: {
            cliente: true,
          },
        });

        //PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
        if (maquina && maquina.descricao) {

          console.log(`recebendo pagamento na máquina: ${maquina.nome} -  ${maquina.descricao}`)

          //VERIFICANDO SE A MÁQUINA PERTENCE A UM CIENTE ATIVO 
          if (cliente != null) {
            if (cliente !== null && cliente !== undefined) {
              if (cliente.ativo) {
                console.log("Cliente ativo - seguindo...");

                //VERIFICAÇÃO DA DATA DE VENCIMENTO:
                if (cliente.dataVencimento) {
                  if (cliente.dataVencimento != null) {
                    console.log("verificando inadimplência...");
                    const dataVencimento: Date = cliente.dataVencimento;
                    const dataAtual = new Date();
                    const diferencaEmMilissegundos = dataAtual.getTime() - dataVencimento.getTime();
                    const diferencaEmDias = Math.floor(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));
                    console.log(diferencaEmDias);
                    if (diferencaEmDias > 10) {
                      console.log("Cliente MENSALIDADE atrasada - estornando...");

                      //EVITAR ESTORNO DUPLICADO
                      const registroExistente = await prisma.pix_Pagamento.findFirst({
                        where: {
                          mercadoPagoId: req.query.id,
                          estornado: true,
                          clienteId: req.params.id
                        },
                      });

                      if (registroExistente) {
                        console.log("Esse estorno ja foi feito...");
                        return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                      } else {
                        console.log("Seguindo...");
                      }
                      //FIM EVITANDO ESTORNO DUPLICADO

                      estornarMP(req.query.id, tokenCliente, "mensalidade com atraso");
                      //REGISTRAR O PAGAMENTO
                      const novoPagamento = await prisma.pix_Pagamento.create({
                        data: {
                          maquinaId: maquina.id,
                          valor: valor.toString(),
                          mercadoPagoId: req.query.id,
                          motivoEstorno: `01- mensalidade com atraso. str_id: ${str_id}`,
                          estornado: true,
                        },
                      });
                      return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                    }
                  }
                  else {
                    console.log("pulando etapa de verificar inadimplência... campo dataVencimento não cadastrado ou nulo!")
                  }
                }
                //FIM VERIFICAÇÃO VENCIMENTO

              } else {
                console.log("Cliente inativo - estornando...");

                //EVITAR ESTORNO DUPLICADO
                const registroExistente = await prisma.pix_Pagamento.findFirst({
                  where: {
                    mercadoPagoId: req.query.id,
                    estornado: true,
                    clienteId: req.params.id
                  },
                });

                if (registroExistente) {
                  console.log("Esse estorno ja foi feito...");
                  return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                } else {
                  console.log("Seguindo...");
                }
                //FIM EVITANDO ESTORNO DUPLICADO

                estornarMP(req.query.id, tokenCliente, "cliente inativo");
                //REGISTRAR O PAGAMENTO
                const novoPagamento = await prisma.pix_Pagamento.create({
                  data: {
                    maquinaId: maquina.id,
                    valor: valor.toString(),
                    mercadoPagoId: req.query.id,
                    motivoEstorno: `02- cliente inativo. str_id: ${str_id}`,
                    estornado: true,
                  },
                });
                return res.status(200).json({ "retorno": "error.. cliente INATIVO - pagamento estornado!" });
              }
            } else {
              console.log("error.. cliente nulo ou não encontrado!");
              return res.status(200).json({ "retorno": "error.. cliente nulo ou não encontrado!" });
            }
          }
          //FIM VERIFICAÇÃO DE CLIENTE ATIVO.

          //VERIFICANDO SE A MÁQUINA ESTÁ OFFLINE 
          if (maquina.ultimaRequisicao instanceof Date) {
            const diferencaEmSegundos = tempoOffline(maquina.ultimaRequisicao);
            if (diferencaEmSegundos > 60) {
              console.log("estornando... máquina offline.");

              //EVITAR ESTORNO DUPLICADO
              const registroExistente = await prisma.pix_Pagamento.findFirst({
                where: {
                  mercadoPagoId: req.query.id,
                  estornado: true,
                },
              });

              if (registroExistente) {
                console.log("Esse estorno ja foi feito...");
                return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
              } else {
                console.log("Seguindo...");
              }
              //FIM EVITANDO ESTORNO DUPLICADO

              estornarMP(req.query.id, tokenCliente, "máquina offline");
              //evitando duplicidade de estorno:
              const estornos = await prisma.pix_Pagamento.findMany({
                where: {
                  mercadoPagoId: req.query.id,
                  estornado: true,
                  clienteId: req.params.id
                },
              });

              if (estornos) {
                if (estornos.length > 0) {
                  return res.status(200).json({ "retorno": "PAGAMENTO JÁ ESTORNADO! - MÁQUINA OFFLINE" });
                }
              }
              //FIM envitando duplicidade de estorno
              //REGISTRAR ESTORNO
              const novoPagamento = await prisma.pix_Pagamento.create({
                data: {
                  maquinaId: maquina.id,
                  valor: valor.toString(),
                  mercadoPagoId: req.query.id,
                  motivoEstorno: `03- máquina offline. str_id: ${str_id}`,
                  estornado: true,
                },
              });
              return res.status(200).json({ "retorno": "PAGAMENTO ESTORNADO - MÁQUINA OFFLINE" });
            }
          } else {
            console.log("estornando... máquina offline.");

            //EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: req.query.id,
                estornado: true,
                clienteId: req.params.id
              },
            });

            if (registroExistente) {
              console.log("Esse estorno ja foi feito...");
              return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
            } else {
              console.log("Seguindo...");
            }
            //FIM EVITANDO ESTORNO DUPLICADO

            estornarMP(req.query.id, tokenCliente, "máquina offline");
            //REGISTRAR O PAGAMENTO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: valor.toString(),
                mercadoPagoId: req.query.id,
                motivoEstorno: `04- máquina offline. str_id: ${str_id}`,
                estornado: true,
              },
            });
            return res.status(200).json({ "retorno": "PAGAMENTO ESTORNADO - MÁQUINA OFFLINE" });
          }
          //FIM VERIFICAÇÃO MÁQUINA OFFLINE

          //VERIFICAR SE O VALOR PAGO É MAIOR QUE O VALOR MÍNIMO

          const valorMinimo = parseFloat(maquina.valorDoPulso);
          if (valor < valorMinimo) {
            console.log("iniciando estorno...")

            //EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: req.query.id,
                estornado: true,
                clienteId: req.params.id
              },
            });

            if (registroExistente) {
              console.log("Esse estorno ja foi feito...");
              return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
            } else {
              console.log("Seguindo...");
            }
            //FIM EVITANDO ESTORNO DUPLICADO


            //REGISTRAR O PAGAMENTO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: valor.toString(),
                mercadoPagoId: req.query.id,
                motivoEstorno: `05- valor inferior ao mínimo. str_id: ${str_id}`,
                estornado: true,
              },
            });
            console.log("estornando valor inferior ao mínimo...");

            estornarMP(req.query.id, tokenCliente, "valor inferior ao mínimo");
            return res.status(200).json({
              "retorno": `PAGAMENTO ESTORNADO - INFERIOR AO VALOR 
            MÍNIMO DE R$: ${valorMinimo} PARA ESSA MÁQUINA.`
            });
          } else {
            console.log("valor permitido finalizando operação...");
          }

          if (response.data.status != "approved") {
            console.log("pagamento não aprovado!");
            return;
          }

          //VERIFICAR SE ESSE PAGAMENTO JÁ FOI EFETUADO
          const registroExistente = await prisma.pix_Pagamento.findFirst({
            where: {
              mercadoPagoId: req.query.id,
              clienteId: req.params.id
            },
          });

          if (registroExistente) {
            console.log("Esse pagamento ja foi feito...");
            return res.status(200).json({ "retorno": "error.. Duplicidade de pagamento!" });
          } else {
            console.log("Seguindo...");
          }
          //VERIFICAR SE ESSE PAGAMENTO JÁ FOI EFETUADO

          //ATUALIZAR OS DADOS DA MÁQUINA QUE ESTAMOS RECEBENDO O PAGAMENTO
          await prisma.pix_Maquina.update({
            where: {
              id: maquina.id,
            },
            data: {
              valorDoPix: valor.toString(),
              ultimoPagamentoRecebido: new Date(Date.now())
            }
          });

          //REGISTRAR O PAGAMENTO
          const novoPagamento = await prisma.pix_Pagamento.create({
            data: {
              maquinaId: maquina.id,
              valor: valor.toString(),
              mercadoPagoId: req.query.id,
              motivoEstorno: ``,
              tipo: tipoPagamento,
              taxas: taxaDaOperacao,
              clienteId: cliId,
              estornado: false,
              operadora: `Mercado Pago`
            },
          });

          if (NOTIFICACOES_PAGAMENTOS) {
            notificarDiscord(NOTIFICACOES_PAGAMENTOS, `Novo pagamento recebido no Mercado Pago. Via APP. R$: ${valor.toString()}`, `Cliente ${cliente?.nome} Maquina: ${maquina?.nome}. Maquina: ${maquina?.descricao}`)
          }

          console.log('Pagamento inserido com sucesso:', novoPagamento);
          return res.status(200).json(novoPagamento);

        } else {

          //PROCESSAMENTO DE EVENTOS QUE NÃO SAO PAYMENTS DE LOJAS E CAIXAS


          console.log("Máquina não encontrada");
          return res.status(200).json({ "retorno": mensagem });
        }


      }).catch((error: any) => {
        console.error('Erro ao processar pagamento, verifique se o token está cadastrado:', error);
        // Aqui você pode adicionar qualquer lógica ou retorno desejado em caso de erro.
        return res.status(500).json({ error: `${error.message}` });
      });



      */



  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "error: " + error });
  }
});

//STORE ID MAQ ?valor=1
app.post("/rota-recebimento-especie/:id", async (req: any, res: any) => {

  try {

    //BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (id da máquina)
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      }
    });

    const value = req.query.valor;

    //PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
    if (maquina) {

      console.log(`recebendo pagamento na máquina: ${maquina.nome}`)
      //REGISTRAR O PAGAMENTO
      const novoPagamento = await prisma.pix_Pagamento.create({
        data: {
          maquinaId: maquina.id,
          valor: value,
          mercadoPagoId: "CASH",
          motivoEstorno: ``,
          tipo: "CASH",
          estornado: false,
        },
      });
      return res.status(200).json({ "pagamento registrado": "Pagamento registrado" });
    }
    else {
      console.log("error.. cliente nulo ou não encontrado!");
      return res.status(404).json({ "retorno": "error.. máquina nulo ou não encontrado!" });
    }


  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "error: " + error });
  }
});



//id da maquina e a quantidade ?valor=1
app.post("/decrementar-estoque/:id/", async (req: any, res: any) => {

  try {

    const value = req.query.valor;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!maquina) {
      return res.status(404).json({ "retorno": "error.. máquina nulo ou não encontrado!" });
    }

    // Calculate the new stock value
    let novoEstoque: number | null = maquina.estoque !== null ? maquina.estoque - Number(value) : -1;

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: req.params.id,
      },
      data: {
        estoque: novoEstoque,
      },
    });

    console.log("Estoque atualizado");
    return res.status(200).json({ "Estoque atual": `${novoEstoque}` });
  } catch (error) {
    console.error("Error updating stock:", error);
    return res.status(404).json({ "retorno": "Erro ao tentar atualizar estoque" });
  }


});

//id da maquina e a quantidade ?valor=1
app.post('/setar-estoque/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const estoque = req.query.valor;

    let val = Number(estoque);

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        estoque: val,
      },
    });

    return res.status(200).json({ "novo estoque:": `${val}` });
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});




app.post("/informacao/:id", async (req: any, res: any) => {
  try {
    // Desestruturar o valor de informacao do corpo da requisição
    const { informacao } = req.body;

    // Verificar se o valor de informacao foi fornecido
    if (typeof informacao === 'undefined') {
      return res.status(400).json({ "erro": "O campo informacao é obrigatório" });
    }

    // Buscar a máquina com o ID passado na rota
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
    });

    // Verificar se a máquina foi encontrada
    if (maquina) {
      // Atualizar o valor de informacao
      const atualizarMaquina = await prisma.pix_Maquina.update({
        where: {
          id: req.params.id,
        },
        data: {
          informacao: informacao, // Atualizar informacao com o valor fornecido
        },
      });

      return res.status(200).json({ "atualização": "Informação atualizada com sucesso", "maquina": atualizarMaquina });
    } else {
      return res.status(404).json({ "erro": "Máquina não encontrada" });
    }
  } catch (error) {
    console.error(error);
 
  }
});




app.post("/entrada_pelucia/:id", async (req: any, res: any) => {
  try {
    // BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (id da máquina)3456784567
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      }
    });

    const value = req.query.valor;
    const mercadoPagoId = req.body.mercadoPagoId; // Obter mercadoPagoId do corpo da requisição
    const estoque2 = req.body.mercadoPagoId; // Obter o valor de estoque2 do corpo da requisição

    // PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
    if (maquina) {
      console.log(`Recebendo pagamento na máquina: ${maquina.nome}`);

      // REGISTRAR O PAGAMENTO
      const novoPagamento = await prisma.pix_Pagamento.create({
        data: {
          maquinaId: maquina.id,
          valor: value,
          mercadoPagoId: mercadoPagoId, // Usar o valor recebido no body
          motivoEstorno: ``,
          tipo: "debit_card",
          estornado: false,
        
        },
      });

      return res.status(200).json({ "pagamento registrado": "Pagamento registrado", estoque2 });
    } else {
      console.log("Erro.. máquina nula ou não encontrada!");
      return res.status(404).json({ "retorno": "Erro.. máquina nula ou não encontrada!" });
    }
  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "Error: " + error });
  }
});






app.post("/saiu_pelucia/:id", async (req: any, res: any) => {
  try {
    // BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (id da máquina)
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        nome: true,
        informacao: true, // Certifique-se de que o campo 'informacao' está sendo retornado
      }
    });

    const value = req.query.valor;
    const mercadoPagoIdFromBody = req.body.mercadoPagoId || ""; // Captura o valor do body

    // PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
    if (maquina) {
      console.log(`Recebendo pagamento na máquina: ${maquina.nome}`);

      // REGISTRAR O PAGAMENTO
      const novoPagamento = await prisma.pix_Pagamento.create({
        data: {
          maquinaId: maquina.id,
          valor: value,
          // Formata 'informacao' e 'mercadoPagoIdFromBody' na frase solicitada
          mercadoPagoId: `${maquina.informacao} SAIU NO VALOR TOTAL DE R$${mercadoPagoIdFromBody},00`, 
          motivoEstorno: ``,
          tipo: "CASH",
          estornado: false,
        },
      });
      
      return res.status(200).json({ "pagamento registrado": "Pagamento registrado" });
    } else {
      console.log("Error.. cliente nulo ou não encontrado!");
      return res.status(404).json({ "retorno": "Error.. máquina nula ou não encontrada!" });
    }
  } catch (error) {
    console.error(error);
    return res.status(402).json({ "error": "Error: " + error });
  }
});





app.post("/contador-credito-baixo/:id/", async (req: any, res: any) => {
  try {
    const value2 = req.query.valor;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!maquina) {
      return res.status(404).json({ "retorno": "error.. máquina nulo ou não encontrado!" });
    }

    // Calculate the new stock value
    let novoEstoque: number;
    if (maquina.contadorcreditobaixo !== null) {
      novoEstoque = maquina.contadorcreditobaixo + Number(value2);
    } else {
      novoEstoque = Number(value2);
    }

    // Sum novoEstoque with contadorcredito
    const novoContadorCredito = (maquina.contadorcredito || 0) + Number(value2);

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: req.params.id,
      },
      data: {
        contadorcreditobaixo: novoEstoque,
        contadorcredito: novoContadorCredito,  // Update contadorcredito with the new sum
      },
    });

    console.log("Estoque atualizado");

    return res.status(200).json({ "Estoque atual": `${novoEstoque}` });
  } catch (error) {
    console.error("Error updating stock:", error);
    return res.status(404).json({ "retorno": "Erro ao tentar atualizar estoque" });
  }
});






app.post("/contador-pelucia-baixo/:id/", async (req: any, res: any) => {
  try {
    const value2 = req.query.valor;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!maquina) {
      return res.status(404).json({ "retorno": "error.. máquina nulo ou não encontrado!" });
    }

    let novoEstoque: number;
    if (maquina.contadorpelucia !== null) {
      novoEstoque = maquina.contadorpelucia + Number(value2);
    } else {
      novoEstoque = Number(value2);
    }
     // Sum novoEstoque with contadorcredito
     const novoContadorPelucia = (maquina.estoque || 0) + Number(value2);;

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: req.params.id,
      },
      data: {
        contadorpelucia: novoEstoque,
        estoque: novoContadorPelucia,
      },
    });

    console.log("Estoque atualizado");

    return res.status(200).json({ "Estoque atual": `${novoEstoque}` });
  } catch (error) {
    console.error("Error updating stock:", error);
    return res.status(404).json({ "retorno": "Erro ao tentar atualizar estoque" });
  }
});








//id da maquina e a quantidade ?valor=1
app.post("/incrementar-estoque/:id/", async (req: any, res: any) => {
  try {
    const value = req.query.valor;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!maquina) {
      return res.status(404).json({ "retorno": "error.. máquina nulo ou não encontrado!" });
    }


    console.log("Estoque atualizado");

    return res.status(200).json({ "Estoque atual": `` });
  } catch (error) {
    console.error("Error updating stock:", error);
    return res.status(404).json({ "retorno": "Erro ao tentar atualizar estoque" });
  }
});










app.post('/probabilidade/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const probabilidade = req.query.valor;
   


    let val = Number(probabilidade);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        probabilidade: val,
        
      },
    });
    res.status(200).json({ message: `probabilidade configurada` });
   
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }

});


app.get('/probabilidade/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        probabilidade: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ probabilidade: maquina.probabilidade });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});




app.post("/contador-credito/:id/", async (req: any, res: any) => {
  try {
    const value = req.query.valor;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!maquina) {
      return res.status(404).json({ "retorno": "error.. máquina nulo ou não encontrado!" });
    }

    // Calculate the new stock value
    let novocontadorcredito: number | null = maquina.contadorcredito !== null ? maquina.contadorcredito + Number(value) : +1;

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: req.params.id,
      },
      data: {
        contadorcredito: novocontadorcredito,
      },
    });

    console.log("Estoque atualizado");

    return res.status(200).json({ "Estoque atual": `${novocontadorcredito}` });
  } catch (error) {
    console.error("Error updating stock:", error);
    return res.status(404).json({ "retorno": "Erro ao tentar atualizar estoque" });
  }
});






app.get('/contador-credito/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
       contadorcredito: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ contadorcredito: maquina.contadorcredito });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});




app.post('/contador-pelucia/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const contadorpelucia = req.query.valor;
   


    let val = Number(contadorpelucia);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        contadorpelucia: val,
        
      },
    });

    res.status(200).json({ message: `contador pelucia configurada` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/contador-pelucia/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
       contadorpelucia: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ contadorpelucia: maquina.contadorpelucia });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});


app.post('/nomepoint/:id', async (req, res) => {
  const maquinaId = req.params.id;
  const { nomepoint } = req.body;

  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da máquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
              nomepoint: nomepoint,
          },
      });

      res.status(200).json({
          message: 'nomepoint atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          nomepoint: updatedMaquina.nomepoint,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o tokenpoint na tabela pix_maquina' });
  }
});


app.post('/envia/:id', async (req, res) => {
  const maquinaId = req.params.id;
  const { valorAdicional } = req.body;  // Valor enviado no body

  try {
    // Busca os valores de whatsapp, apikey e informacao na tabela pix_maquina
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        whatsapp: true,
        apikey: true,
        informacao: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada' });
    }

    // Monta a URL para a requisição, incluindo informacao e o valorAdicional no parâmetro text
    const url = `http://api.callmebot.com/whatsapp.php?phone=+${maquina.whatsapp}&apikey=${maquina.apikey}&text=SUA MAQUINA ACABOU DE LIBERAR O PREMIO ${maquina.informacao} O SEU PREMIO FOI LIBERADO COM UM TOTAL DE R$${valorAdicional},00`;

    // Faz a requisição para o CallMeBot
    const response = await axios.get(url);

    // Retorna a resposta da requisição externa
    res.status(200).json({
      message: 'Requisição enviada com sucesso!',
      data: response.data,
    });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar a requisição' });
  }
});





app.get('/dados/:id', async (req, res) => {
  const maquinaId = req.params.id;

  try {
      // Busca o valor de whatsapp na tabela pix_maquina usando o id da máquina
      const maquina = await prisma.pix_Maquina.findUnique({
          where: {
              id: maquinaId,
          },
          select: {
              whatsapp: true,
              apikey: true,
          },
      });

      if (!maquina) {
          return res.status(404).json({ error: 'Máquina não encontrada' });
      }

      res.status(200).json({
          whatsapp: maquina.whatsapp,
          apikey: maquina.apikey,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar o whatsapp na tabela pix_maquina' });
  }
});



app.post('/whatsapp/:id', async (req, res) => {
  const maquinaId = req.params.id;
  const { whatsapp } = req.body;

  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da máquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
            whatsapp: whatsapp,
          },
      });

      res.status(200).json({
          message: 'whatsapp atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          whatsapp: updatedMaquina.whatsapp,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o tokenpoint na tabela pix_maquina' });
  }
});





app.post('/apikey/:id', async (req, res) => {
  const maquinaId = req.params.id;
  const { apikey } = req.body;

  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da máquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
            apikey: apikey,
          },
      });

      res.status(200).json({
          message: 'apikey atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          apikey: updatedMaquina.apikey,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o tokenpoint na tabela pix_maquina' });
  }
});



app.post('/tokenpoint/:id', async (req, res) => {
  const maquinaId = req.params.id;
  const { tokenpoint } = req.body;

  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da máquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
              tokenpoint: tokenpoint,
          },
      });

      res.status(200).json({
          message: 'Tokenpoint atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          tokenpoint: updatedMaquina.tokenpoint,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o tokenpoint na tabela pix_maquina' });
  }
});
app.post('/estadojoystick/:id', async (req, res) => {
  const maquinaId = req.params.id;
 

  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da máquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
              estado: '3',
          },
      });

      res.status(200).json({
          message: 'estado atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          estado: updatedMaquina.estado,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o estado na tabela pix_maquina' });
  }
});

app.post('/estadotelemetria/:id', async (req, res) => {
  const maquinaId = req.params.id;
 

  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da máquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
              estado: '1',
          },
      });

      res.status(200).json({
          message: 'estado atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          estado: updatedMaquina.estado,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o estado na tabela pix_maquina' });
  }
});

app.post('/estadowhatsaap/:id', async (req, res) => {
  const maquinaId = req.params.id;


  try {
      // Atualiza o tokenpoint na tabela pix_maquina usando o id da smáquina
      const updatedMaquina = await prisma.pix_Maquina.update({
          where: {
              id: maquinaId,
          },
          data: {
              estado: '2',
          },
      });

      res.status(200).json({
          message: 'estado atualizado com sucesso na tabela pix_maquina!',
          id: updatedMaquina.id,
          estado: updatedMaquina.estado,
      });
  } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar o estado na tabela pix_maquina' });
  }
});





app.post('/garra-forte/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const garraforte = req.query.valor;
   


    let val = Number(garraforte);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        garraforte: val,
        
      },
    });

    res.status(200).json({ message: `garra forte configurada` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


app.get('/garra-forte/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        garraforte: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ garraforte: maquina.garraforte });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});



app.get('/valor-pulso/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        valorpulso: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ valorpulso: maquina.valorpulso });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});








app.post('/garra-media/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const garramedia = req.query.valor;
   


    let val = Number(garramedia);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        garramedia: val,
        
      },
    });

    res.status(200).json({ message: `garra media configurada` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


app.get('/garra-media/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        garramedia: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ garramedia: maquina.garramedia });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});




app.post('/garra-fraca/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const garrafraca = req.query.valor;
   


    let val = Number(garrafraca);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        garrafraca: val,
        
      },
    });

    res.status(200).json({ message: `garra fraca configurada` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


app.get('/garra-fraca/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        garrafraca: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ garrafraca: maquina.garrafraca });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});



app.post('/garra-pegada/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const garrapegada = req.query.valor;
   


    let val = Number(garrapegada);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        garrapegada: val,
        
      },
    });

    res.status(200).json({ message: `garra pegada configurada` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


app.get('/garra-pegada/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
      select: {
        garrapegada: true,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada!' });
    }

    res.status(200).json({ garrapegada: maquina.garrapegada });
  } catch (error) {
    console.error('Error retrieving probability:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});


app.post('/setar-relogio-credito/:id', async (req, res) => {//ug
  try {
    const maquinaId = req.params.id;
    const contadorcredito = req.query.valor;
   


    let val = Number(contadorcredito);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        contadorcredito: val,
        
      },
    });

    return res.status(200).json({ "novo contadorcredito:": `${val}` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


app.post('/setar-estoque-baixo/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const estoque5 = req.query.valor;
   


    let val = Number(estoque5);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        estoque5: val,
        
      },
    });

    return res.status(200).json({ "novo estoque5:": `${val}` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


//id da maquina e a quantidade ?valor=1
app.post('/setar-estoque/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const estoque = req.query.valor;
   


    let val = Number(estoque);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the update
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        estoque: val,
        
      },
    });

    return res.status(200).json({ "novo estoque:": `${val}` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});







app.post('/setar-estoque3/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const estoque3 = req.query.valor;
   


    let val3 = Number(estoque3);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the updateg
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        estoque3: val3,
        
      },
    });


    return res.status(200).json({ "novo estoque3:": `${val3}` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});


app.post('/setar-estoque4/:id', async (req, res) => {
  try {
    const maquinaId = req.params.id;
    const estoque4 = req.query.valor;
   


    let val4 = Number(estoque4);
    

    // Find the Pix_Maquina by id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: maquinaId,
      },
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Maquina não encontrada!' });
    }

    // Perform the updateg
    await prisma.pix_Maquina.update({
      where: {
        id: maquinaId,
      },
      data: {
        estoque4: val4,
        
      },
    });


    return res.status(200).json({ "novo estoque4:": `${val4}` });
    
  } catch (error) {
    console.error('Error updating stock:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});





//RELATORIO DE PAGAMENTOS POR MÁQUINA
app.get("/pagamentos/:maquinaId", verifyJWT, async (req: any, res) => {

  console.log(`${req.params.maquinaId} acessou a rota de pagamentos.`);

  try {

    var totalRecebido = 0.0;
    var totalEstornado = 0.0;
    var totalEspecie = 0.0;

    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        removido: false
      },
      orderBy: {
        data: 'desc', // 'desc' para ordem decrescente (da mais recente para a mais antiga)
      }
    });

    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.maquinaId
      }
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada' });
    }

    // Verifica se o estoque está definido e retorna seu valor
    const estoque = maquina.estoque !== null ? maquina.estoque : '--';


    let totalSemEstorno = 0;
    let totalComEstorno = 0;

    for (const pagamento of pagamentos) {
      const valor = parseFloat(pagamento.valor);

      if (pagamento.estornado === false) {
        totalSemEstorno += valor;
      } else {
        totalComEstorno += valor;
      }
    }

    const especie = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        removido: false,
        mercadoPagoId: `CASH`
      }
    });

    for (const e of especie) {
      const valor = parseFloat(e.valor);
      totalEspecie += valor;

    }

    return res.status(200).json({ "total": totalSemEstorno, "estornos": totalComEstorno, "cash": totalEspecie, "estoque": estoque, "pagamentos": pagamentos });
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});

//RELATORIO DE PAGAMENTOS POR MÁQUINA
app.get("/pagamentos-adm/:maquinaId", verifyJwtPessoa, async (req: any, res) => {

  console.log(`${req.params.maquinaId} acessou a rota de pagamentos.`);

  try {

    var totalRecebido = 0.0;
    var totalEstornado = 0.0;
    var totalEspecie = 0.0;

    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        removido: false
      },
      orderBy: {
        data: 'desc', // 'desc' para ordem decrescente (da mais recente para a mais antiga)
      }
    });

    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: req.params.maquinaId
      }
    });

    if (!maquina) {
      return res.status(404).json({ error: 'Máquina não encontrada' });
    }

    // Verifica se o estoque está definido e retorna seu valor
    const probabilidade = maquina.probabilidade !== null ? maquina.probabilidade : '--';
    const garraforte = maquina.garraforte !== null ? maquina.garraforte : '--';
    const contadorcredito = maquina.contadorcredito !== null ? maquina.contadorcredito : '--';
    const contadorcreditobaixo = maquina.contadorcreditobaixo !== null ? maquina.contadorcreditobaixo : '--';
    const contadorpelucia = maquina.contadorpelucia !== null ? maquina.contadorpelucia : '--';
    const estoque = maquina.estoque !== null ? maquina.estoque : '--';
    const estoquebaixo = maquina.estoquebaixo !== null ? maquina.estoquebaixo : '--';
    const estoque2 = maquina.estoque2 !== null ? maquina.estoque2 : '--';
    const estoque3 = maquina.estoque3 !== null ? maquina.estoque3 : '--';
    const estoque4 = maquina.estoque4 !== null ? maquina.estoque4 : '--';
    const estoque5 = maquina.estoque5 !== null ? maquina.estoque5 : '--';
    const estado = maquina.estado !== null ? maquina.estado : '--';
    let totalSemEstorno = 0;
    let totalComEstorno = 0;

    for (const pagamento of pagamentos) {
      const valor = parseFloat(pagamento.valor);

      if (pagamento.estornado === false) {
        totalSemEstorno += valor;
      } else {
        totalComEstorno += valor;
      }
    }

    const especie = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        removido: false,
        mercadoPagoId: `CASH`
      }
    });

    for (const e of especie) {
      const valor = parseFloat(e.valor);
      totalEspecie += valor;

    }

    return res.status(200).json({ "total": totalSemEstorno, "estornos": totalComEstorno, "cash": totalEspecie, "estoque": estoque, "pagamentos": pagamentos });
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});


//RELATORIO DE PAGAMENTOS POR MÁQUINA POR PERÍODO
app.post("/pagamentos-periodo/:maquinaId", verifyJWT, async (req: any, res) => {

  try {

    var totalRecebido = 0.0;
    var totalEstornado = 0.0;
    var totalEspecie = 0.0;

    const dataInicio = new Date(req.body.dataInicio);

    const dataFim = new Date(req.body.dataFim);

    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        data: {
          gte: dataInicio,
          lte: dataFim,
        },
      },
      orderBy: {
        data: 'desc', // 'desc' para ordem decrescente (da mais recente para a mais antiga)
      }
    });

    let totalSemEstorno = 0;
    let totalComEstorno = 0;

    for (const pagamento of pagamentos) {
      const valor = parseFloat(pagamento.valor);

      if (pagamento.estornado === false) {
        totalSemEstorno += valor;
      } else {
        totalComEstorno += valor;
      }
    }

    const especie = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        removido: false,
        mercadoPagoId: `CASH`
      }
    });

    for (const e of especie) {
      const valor = parseFloat(e.valor);
      totalEspecie += valor;

    }

    return res.status(200).json({ "total": totalSemEstorno, "estornos": totalComEstorno, "cash": totalEspecie, "pagamentos": pagamentos });

    } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});

//RELATORIO DE PAGAMENTOS POR MÁQUINA POR PERÍODO
app.post("/pagamentos-periodo-adm/:maquinaId", verifyJwtPessoa, async (req: any, res) => {

  try {

    var totalRecebido = 0.0;
    var totalEstornado = 0.0;
    var totalEspecie = 0.0;

    const dataInicio = new Date(req.body.dataInicio);

    const dataFim = new Date(req.body.dataFim);

    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        data: {
          gte: dataInicio,
          lte: dataFim,
        },
      },
      orderBy: {
        data: 'desc', // 'desc' para ordem decrescente (da mais recente para a mais antiga)
      }
    });

    let totalSemEstorno = 0;
    let totalComEstorno = 0;

    for (const pagamento of pagamentos) {
      const valor = parseFloat(pagamento.valor);

      if (pagamento.estornado === false) {
        totalSemEstorno += valor;
      } else {
        totalComEstorno += valor;
      }
    }

    const especie = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.params.maquinaId,
        removido: false,
        mercadoPagoId: `CASH`
      }
    });

    for (const e of especie) {
      const valor = parseFloat(e.valor);
      totalEspecie += valor;

    }

    return res.status(200).json({ "total": totalSemEstorno, "estornos": totalComEstorno, "cash": totalEspecie, "pagamentos": pagamentos });

     } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});


//ASSINATURA
app.post("/assinatura", async (req: any, res) => {
  try {
    console.log(req.body);
    return res.status(200).json({ "status": "ok" });
  } catch (err: any) {
    console.log(err);
    return res.status(500).json({ "retorno": "ERRO" });
  }
});

app.delete('/delete-pagamentos/:maquinaId', verifyJWT, async (req, res) => {
  const maquinaId = req.params.maquinaId;

  try {
    // Deletar todos os pagamentos com base no maquinaId
    const updatePagamentos = await prisma.pix_Pagamento.updateMany({
      where: {
        maquinaId: maquinaId
      },
      data: {
        removido: true
      }
    });

    res.status(200).json({ message: `Todos os pagamentos para a máquina com ID ${maquinaId} foram removidos.` });
  } catch (error) {
    console.error('Erro ao deletar os pagamentos:', error);
    res.status(500).json({ error: 'Erro ao deletar os pagamentos.' });
  }
});

app.delete('/delete-pagamentos-adm/:maquinaId', verifyJwtPessoa, async (req, res) => {
  const maquinaId = req.params.maquinaId;

  try {
    // Deletar todos os pagamentos com base no maquinaId
    const updatePagamentos = await prisma.pix_Pagamento.updateMany({
      where: {
        maquinaId: maquinaId
      },
      data: {
        removido: true
      }
    });

    res.status(200).json({ message: `Todos os pagamentos para a máquina com ID ${maquinaId} foram removidos.` });
  } catch (error) {
    console.error('Erro ao deletar os pagamentos:', error);
    res.status(500).json({ error: 'Erro ao deletar os pagamentos.' });
  }
});

//RELATÓRIOS
app.post("/relatorio-01-cash", verifyJWT, async (req, res) => {
  try {

    console.log(`************** cash`);
    console.log(req.body);

    //return res.status(200).json({valor : "2"});
    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        estornado: false,
        mercadoPagoId: "CASH",
        maquinaId: req.body.maquinaId,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });

    // Calculando o somatório dos valores dos pagamentos
    const somatorio = pagamentos.reduce((acc, pagamento) => acc + parseInt(pagamento.valor), 0);

    return res.status(200).json({ valor: somatorio });


  } catch (e) {
    res.json({ error: "error" + e });
  }
});

app.post("/relatorio-01-cash-adm", verifyJwtPessoa, async (req, res) => {
  try {

    console.log(`************** cash`);
    console.log(req.body);

    //return res.status(200).json({valor : "2"});
    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        estornado: false,
        mercadoPagoId: "CASH",
        maquinaId: req.body.maquinaId,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });

    // Calculando o somatório dos valores dos pagamentos
    const somatorio = pagamentos.reduce((acc, pagamento) => acc + parseInt(pagamento.valor), 0);

    return res.status(200).json({ valor: somatorio });


  } catch (e) {
    res.json({ error: "error" + e });
  }
});



app.post("/relatorio-02-taxas", verifyJWT, async (req, res) => {
  try {

    console.log(`************** taxas`);
    console.log(req.body);

    if (req.body.maquinaId == null) {
      return res.status(500).json({ error: `necessário informar maquinaId` });
    }

    try {

      const pagamentos_pix = await prisma.pix_Pagamento.findMany({
        where: {
          maquinaId: req.body.maquinaId,
          tipo: "bank_transfer",
          estornado: false,
          data: {
            gte: new Date(req.body.dataInicio),
            lte: new Date(req.body.dataFim),
          }
        }
      });


      let totalTaxasPix = 0;
      for (const pagamento of pagamentos_pix) {
        const taxa = pagamento.taxas !== null ? pagamento.taxas : "0";
        totalTaxasPix += parseFloat(taxa) || 0;
      }



      const pagamentos = await prisma.pix_Pagamento.findMany({
        where: {
          maquinaId: req.body.maquinaId,
          tipo: "credit_card",
          estornado: false,
          data: {
            gte: new Date(req.body.dataInicio),
            lte: new Date(req.body.dataFim),
          }
        }
      });


      let totalTaxasCredito = 0;
      for (const pagamento of pagamentos) {
        const taxa = pagamento.taxas !== null ? pagamento.taxas : "0";
        totalTaxasCredito += parseFloat(taxa) || 0;
      }

      const pagamentos_debito = await prisma.pix_Pagamento.findMany({
        where: {
          maquinaId: req.body.maquinaId,
          tipo: "debit_card",
          estornado: false,
          data: {
            gte: new Date(req.body.dataInicio),
            lte: new Date(req.body.dataFim),
          }
        }
      });


      let totalTaxasDebito = 0;
      for (const pagamento of pagamentos_debito) {
        const taxa = pagamento.taxas !== null ? pagamento.taxas : "0";
        totalTaxasDebito += parseFloat(taxa) || 0;
      }


      return res.status(200).json({ pix: totalTaxasPix, credito: totalTaxasCredito, debito: totalTaxasDebito });


    } catch (e) {
      res.json({ error: "error" + e });
    }

  } catch (e) {
    res.json({ "error": "error" + e });
  }
});



app.post("/relatorio-02-taxas-adm", verifyJwtPessoa, async (req, res) => {
  try {

    console.log(`************** taxas`);
    console.log(req.body);

    if (req.body.maquinaId == null) {
      return res.status(500).json({ error: `necessário informar maquinaId` });
    }

    try {

      const pagamentos_pix = await prisma.pix_Pagamento.findMany({
        where: {
          maquinaId: req.body.maquinaId,
          tipo: "bank_transfer",
          estornado: false
        }
      });


      let totalTaxasPix = 0;
      for (const pagamento of pagamentos_pix) {
        const taxa = pagamento.taxas !== null ? pagamento.taxas : "0";
        totalTaxasPix += parseFloat(taxa) || 0;
      }



      const pagamentos = await prisma.pix_Pagamento.findMany({
        where: {
          maquinaId: req.body.maquinaId,
          tipo: "credit_card",
          estornado: false
        }
      });


      let totalTaxasCredito = 0;
      for (const pagamento of pagamentos) {
        const taxa = pagamento.taxas !== null ? pagamento.taxas : "0";
        totalTaxasCredito += parseFloat(taxa) || 0;
      }

      const pagamentos_debito = await prisma.pix_Pagamento.findMany({
        where: {
          maquinaId: req.body.maquinaId,
          tipo: "debit_card",
          estornado: false
        }
      });


      let totalTaxasDebito = 0;
      for (const pagamento of pagamentos_debito) {
        const taxa = pagamento.taxas !== null ? pagamento.taxas : "0";
        totalTaxasDebito += parseFloat(taxa) || 0;
      }


      return res.status(200).json({ pix: totalTaxasPix, credito: totalTaxasCredito, debito: totalTaxasDebito });


    } catch (e) {
      res.json({ error: "error" + e });
    }

  } catch (e) {
    res.json({ "error": "error" + e });
  }
});


app.post("/relatorio-03-pagamentos", verifyJWT, async (req, res) => {
  try {

    console.log(`************** pagamentos`);
    console.log(req.body);

    if (req.body.maquinaId == null) {
      return res.status(500).json({ error: `necessário informar maquinaId` });
    }

    const pagamentos_pix = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        tipo: "bank_transfer",
        estornado: false,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });


    let pagamentosPix = 0;
    for (const pagamento of pagamentos_pix) {
      const valor = pagamento.valor !== null ? pagamento.valor : "0";
      pagamentosPix += parseFloat(valor) || 0;
    }

    const pagamentos_credito = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        tipo: "credit_card",
        estornado: false,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });


    let pagamentosCredito = 0;
    for (const pagamento of pagamentos_credito) {
      const valorCredito = pagamento.valor !== null ? pagamento.valor : "0";
      pagamentosCredito += parseFloat(valorCredito) || 0;
    }

    const pagamentos_debito = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        tipo: "debit_card",
        estornado: false,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });


    let pagamentosDebito = 0;
    for (const pagamento of pagamentos_debito) {
      const valorDebito = pagamento.valor !== null ? pagamento.valor : "0";
      pagamentosDebito += parseFloat(valorDebito) || 0;
    }

    return res.status(200).json({ pix: pagamentosPix, especie: -1, credito: pagamentosCredito, debito: pagamentosDebito });


  } catch (e) {
    res.json({ "error": "error" + e });
  }
});

app.post("/relatorio-03-pagamentos-adm", verifyJwtPessoa, async (req, res) => {
  try {

    console.log(`************** pagamentos`);
    console.log(req.body);

    if (req.body.maquinaId == null) {
      return res.status(500).json({ error: `necessário informar maquinaId` });
    }

    const pagamentos_pix = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        tipo: "bank_transfer",
        estornado: false,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });


    let pagamentosPix = 0;
    for (const pagamento of pagamentos_pix) {
      const valor = pagamento.valor !== null ? pagamento.valor : "0";
      pagamentosPix += parseFloat(valor) || 0;
    }

    const pagamentos_credito = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        tipo: "credit_card",
        estornado: false,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });


    let pagamentosCredito = 0;
    for (const pagamento of pagamentos_credito) {
      const valorCredito = pagamento.valor !== null ? pagamento.valor : "0";
      pagamentosCredito += parseFloat(valorCredito) || 0;
    }

    const pagamentos_debito = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        tipo: "debit_card",
        estornado: false,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        }
      }
    });


    let pagamentosDebito = 0;
    for (const pagamento of pagamentos_debito) {
      const valorDebito = pagamento.valor !== null ? pagamento.valor : "0";
      pagamentosDebito += parseFloat(valorDebito) || 0;
    }

    return res.status(200).json({ pix: pagamentosPix, especie: -1, credito: pagamentosCredito, debito: pagamentosDebito });


  } catch (e) {
    res.json({ "error": "error" + e });
  }
});

app.post("/relatorio-04-estornos", verifyJWT, async (req, res) => {
  try {

    console.log(`************** estornos`);
    console.log(req.body);

    if (req.body.maquinaId == null) {
      return res.status(500).json({ error: `necessário informar maquinaId` });
    }

    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        estornado: true,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        },
      },
      select: {
        valor: true,
      },
    });

    // Calculando o somatório dos valores dos pagamentos
    const somatorioValores = pagamentos.reduce((acc, curr) => {
      return acc + parseFloat(curr.valor);
    }, 0);

    return res.status(200).json({ valor: somatorioValores });


  } catch (e) {
    res.json({ "error": "error" + e });
  }
});

app.post("/relatorio-04-estornos-adm", verifyJwtPessoa, async (req, res) => {
  try {

    console.log(`************** estornos`);
    console.log(req.body);

    if (req.body.maquinaId == null) {
      return res.status(500).json({ error: `necessário informar maquinaId` });
    }

    const pagamentos = await prisma.pix_Pagamento.findMany({
      where: {
        maquinaId: req.body.maquinaId,
        estornado: true,
        data: {
          gte: new Date(req.body.dataInicio),
          lte: new Date(req.body.dataFim),
        },
      },
      select: {
        valor: true,
      },
    });

    // Calculando o somatório dos valores dos pagamentos
    const somatorioValores = pagamentos.reduce((acc, curr) => {
      return acc + parseFloat(curr.valor);
    }, 0);

    return res.status(200).json({ valor: somatorioValores });


  } catch (e) {
    res.json({ "error": "error" + e });
  }
});

const util = require('util');
// Transformar parseString em uma Promise
const parseStringPromise = util.promisify(xml2js.parseString);

var estornarOperacaoPagSeguroCount = 0;

async function estornarOperacaoPagSeguro(email: String, token: String, idOperacao: String) {
  const url = `https://ws.pagseguro.uol.com.br/v2/transactions/refunds`;

  try {
    const response = await axios.post('https://ws.pagseguro.uol.com.br/v2/transactions/refunds', null, {
      params: {
        email: email,
        token: token,
        transactionCode: idOperacao // Usando o transactionCode diretamente como parâmetro
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.status === 200) {
      console.log('Tentativa: ', estornarOperacaoPagSeguroCount);
      console.log('Estorno realizado com sucesso:', response.data);
      estornarOperacaoPagSeguroCount = 1;
      return response.data;
    } else {
      console.log('Tentativa: ', estornarOperacaoPagSeguroCount);
      console.error('Falha ao realizar o estorno:', response.data);

      estornarOperacaoPagSeguroCount++;
      if (estornarOperacaoPagSeguroCount <= 20) {
        estornarOperacaoPagSeguro(email, token, idOperacao);
      }else {
      console.log("Após 20 tentativas não conseguimos efetuar o estorno!");
      estornarOperacaoPagSeguroCount = 1;
    }

      return response.data;
    }
  } catch (error: any) {
    console.error('Erro ao tentar estornar operação:', error.response ? error.response.data : error.message);
    estornarOperacaoPagSeguroCount++;
    if (estornarOperacaoPagSeguroCount <= 20) {
      estornarOperacaoPagSeguro(email, token, idOperacao);
    }else {
      console.log("Após 20 tentativas não conseguimos efetuar o estorno!");
      estornarOperacaoPagSeguroCount = 1;
    }
  }
}



app.post('/webhookpagbank/:idCliente', async (req: any, res: any) => {
  try {
    const PAGSEGURO_API_URL = 'https://ws.pagseguro.uol.com.br/v3/transactions/notifications';

    const notificationCode = req.body.notificationCode;
    const notificationType = req.body.notificationType;

    console.log('Notification Code:', notificationCode);
    console.log('Notification Type:', notificationType);

    let serialNumber = '';

    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.params.idCliente,
      },
    });

    const tokenCliente = cliente?.pagbankToken || '';
    const emailCliente = cliente?.pagbankEmail || '';

    if (tokenCliente) {
      console.log("Token obtido.");
    }

    if (emailCliente) {
      console.log("Email obtido.");
    }

    console.log("Cliente ativo:", cliente?.ativo);

    // Monta a URL para a consulta da notificação
    const url = `${PAGSEGURO_API_URL}/${notificationCode}?email=${emailCliente}&token=${tokenCliente}`;

    // Faz a requisição GET para a API do PagSeguro
    const response = await axios.get(url);

    // Converte o XML em JSON usando parseStringPromise
    const result = await parseStringPromise(response.data);

    const transaction = result.transaction;
    const creditorFees = transaction.creditorFees[0];

    const paymentMethod = transaction.paymentMethod[0];
    console.log('Método de Pagamento - Tipo:', paymentMethod.type[0]);

    console.log('Dados da Transação:', transaction);

    // Verificar se deviceInfo existe e mapear suas propriedades
    if (transaction.deviceInfo && transaction.deviceInfo.length > 0) {
      const deviceInfo = transaction.deviceInfo[0];

      console.log('Device Info encontrado:');
      serialNumber = deviceInfo.serialNumber ? deviceInfo.serialNumber[0] : 'Não disponível';
      console.log('Serial Number:', serialNumber);
      console.log('Referência:', deviceInfo.reference ? deviceInfo.reference[0] : 'Não disponível');
      console.log('Bin:', deviceInfo.bin ? deviceInfo.bin[0] : 'Não disponível');
      console.log('Holder:', deviceInfo.holder ? deviceInfo.holder[0] : 'Não disponível');

      // BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (store_id)
      const maquina = await prisma.pix_Maquina.findFirst({
        where: {
          maquininha_serial: serialNumber,
          clienteId: req.params.idCliente,
        },
        include: {
          cliente: true,
        },
      });

      console.log("Máquina:", maquina);

      // PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
      if (maquina && maquina.maquininha_serial) {
        console.log(`Processando pagamento na máquina: ${maquina.nome} - id: ${maquina.id}`);

        // Validações antes de processar o pagamento
        console.log(`Recebendo pagamento na máquina: ${maquina.nome} - store_id: ${maquina.store_id}`);

        // VERIFICANDO SE A MÁQUINA PERTENCE A UM CLIENTE ATIVO
        if (cliente) {
          if (cliente.ativo) {
            console.log("Cliente ativo - seguindo...");

            // VERIFICAÇÃO DA DATA DE VENCIMENTO:
            if (cliente.dataVencimento) {
              const dataVencimento: Date = cliente.dataVencimento;
              const dataAtual = new Date();
              const diferencaEmMilissegundos = dataAtual.getTime() - dataVencimento.getTime();
              const diferencaEmDias = Math.floor(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));

              console.log(diferencaEmDias);

              if (diferencaEmDias > 10) {
                console.log("Cliente MENSALIDADE atrasada - estornando...");

                // EVITAR ESTORNO DUPLICADO
                const registroExistente = await prisma.pix_Pagamento.findFirst({
                  where: {
                    mercadoPagoId: transaction.code[0].toString(),
                    estornado: true,
                    clienteId: req.params.idCliente,
                  },
                });

                if (registroExistente) {
                  console.log("Esse estorno já foi feito...");
                  return res.status(200).json({ retorno: "Erro: cliente atrasado - mais de 10 dias sem pagamento!" });
                }

                console.log("3561");
                estornarOperacaoPagSeguro(emailCliente, tokenCliente, transaction.code[0].toString());

                // REGISTRAR O PAGAMENTO
                const novoPagamento = await prisma.pix_Pagamento.create({
                  data: {
                    maquinaId: maquina.id,
                    valor: transaction.grossAmount[0].toString(),
                    mercadoPagoId: transaction.code[0].toString(),
                    motivoEstorno: '01 - Mensalidade com atraso.',
                    estornado: true,
                    operadora: "Pagbank",
                    clienteId: req.params.idCliente,
                  },
                });

                return res.status(200).json({ retorno: "Erro: cliente atrasado - mais de 10 dias sem pagamento!" });
              }
            } else {
              console.log("Pulando etapa de verificar inadimplência... campo dataVencimento não cadastrado ou nulo!");
            }
          } else {
            console.log("Cliente inativo - estornando...");

            // EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: transaction.code[0].toString(),
                estornado: true,
                clienteId: req.params.idCliente,
              },
            });

            if (registroExistente) {
              console.log("Esse estorno já foi feito...");
              return res.status(200).json({ retorno: "Erro: cliente inativo!" });
            }

            console.log("3598");
            estornarOperacaoPagSeguro(emailCliente, tokenCliente, transaction.code[0].toString());

            // REGISTRAR O PAGAMENTO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: transaction.grossAmount[0].toString(),
                mercadoPagoId: transaction.code[0].toString(),
                motivoEstorno: '02 - Cliente inativo.',
                estornado: true,
                operadora: "Pagbank",
                clienteId: req.params.idCliente,
              },
            });

            return res.status(200).json({ retorno: "Erro: cliente inativo - pagamento estornado!" });
          }
        }

        // VERIFICANDO SE A MÁQUINA ESTÁ OFFLINE
        if (maquina.ultimaRequisicao instanceof Date) {
          const diferencaEmSegundos = tempoOffline(maquina.ultimaRequisicao);
          if (diferencaEmSegundos > 60) {
            console.log("Estornando... máquina offline.");

            // EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: transaction.code[0].toString(),
                estornado: true,
                clienteId: req.params.idCliente,
              },
            });

            if (registroExistente) {
              console.log("Esse estorno já foi feito...");
              return res.status(200).json({ retorno: "Erro: Esse estorno já foi feito..." });
            }

            console.log("3637");
            estornarOperacaoPagSeguro(emailCliente, tokenCliente, transaction.code[0].toString());

            // REGISTRAR O ESTORNO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: transaction.grossAmount[0].toString(),
                mercadoPagoId: transaction.code[0].toString(),
                motivoEstorno: '03 - Máquina offline.',
                clienteId: req.params.idCliente,
                estornado: true,
              },
            });

            return res.status(200).json({ retorno: "Pagamento estornado - Máquina offline" });
          }
        }

        // VERIFICAR SE O VALOR PAGO É MAIOR QUE O VALOR MÍNIMO
        const valorMinimo = parseFloat(maquina.valorDoPulso);
        const valorAtual = parseFloat(transaction.netAmount[0].toString());

        console.log("Valor atual: " + valorAtual);

        if (valorAtual < valorMinimo) {
          console.log("Iniciando estorno...");

          // EVITAR ESTORNO DUPLICADO
          const registroExistente = await prisma.pix_Pagamento.findFirst({
            where: {
              mercadoPagoId: transaction.code[0].toString(),
              estornado: true,
              clienteId: req.params.idCliente,
            },
          });

          if (registroExistente) {
            console.log("Esse estorno já foi feito...");
            return res.status(200).json({ retorno: "Erro: Esse estorno já foi feito..." });
          }

          console.log("3578");
          estornarOperacaoPagSeguro(emailCliente, tokenCliente, transaction.code[0].toString());

          // REGISTRAR O PAGAMENTO
          const novoPagamento = await prisma.pix_Pagamento.create({
            data: {
              maquinaId: maquina.id,
              valor: transaction.grossAmount[0].toString(),
              mercadoPagoId: transaction.code[0].toString(),
              motivoEstorno: '05 - Valor inferior ao mínimo.',
              estornado: true,
              operadora: "Pagbank",
              clienteId: req.params.idCliente,
            },
          });

          return res.status(200).json({ retorno: `Pagamento estornado - Inferior ao valor mínimo de R$: ${valorMinimo} para essa máquina.` });
        }

        // ATUALIZAR OS DADOS DA MÁQUINA
        await prisma.pix_Maquina.update({
          where: {
            id: maquina.id,
          },
          data: {
            valorDoPix: transaction.grossAmount[0].toString(),
            ultimoPagamentoRecebido: new Date(Date.now()),
          },
        });

        // REGISTRAR O PAGAMENTO
        const novoPagamento = await prisma.pix_Pagamento.create({
          data: {
            maquinaId: maquina.id, 
            valor: transaction.grossAmount[0].toString(),
            mercadoPagoId: transaction.code[0].toString(),
            motivoEstorno: '',
            tipo: paymentMethod.type[0].toString(),
            taxas: (parseFloat(transaction.grossAmount[0].toString()) - 
            parseFloat(transaction.netAmount[0].toString())).toString(),
            clienteId: req.params.idCliente,
            estornado: false,
            operadora: 'Pagbank',
          },
        });

        if (NOTIFICACOES_PAGAMENTOS) {
          notificarDiscord(NOTIFICACOES_PAGAMENTOS, `Novo pagamento recebido no Pagbank. R$: ${transaction.grossAmount[0].toString()}`, `Cliente ${cliente?.nome} Maquina: ${maquina?.nome}. Maquina: ${maquina?.descricao}`)
        }

        console.log('Pagamento inserido com sucesso:', novoPagamento);
      } else {
        console.log(`Nova maquininha detectada não cadastrada. Serial: ${serialNumber} - cliente: ${cliente?.nome}`);

        if (NOTIFICACOES_GERAL) {
          notificarDiscord(NOTIFICACOES_GERAL, `Pagamento recebido em maquininha não cadastrada.`, `Cliente ${cliente?.nome} Serial: ${serialNumber}. Maquina: ${maquina?.nome}
            Maquina: ${maquina?.descricao}`)
        }

      }
    } else {
      console.log('Device Info não encontrado.');
    }

    // Retorna os dados da transação em JSON
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Erro ao processar a requisição:', error.message);
    res.status(500).send('Erro ao processar a requisição');
  }
});




// implementações da v5

// Rota para inserir valores vindo via JSON
app.post('/inserir-maquininha', verifyJwtPessoa, async (req, res) => {
  try {
    // Pegando os dados do corpo da requisição
    const {
      codigo,
      operacao,
      urlServidor,
      webhook01,
      webhook02,
      rotaConsultaStatusMaq,
      rotaConsultaAdimplencia,
      idMaquina,
      idCliente,
      valor1,
      valor2,
      valor3,
      valor4,
      textoEmpresa,
      corPrincipal,
      corSecundaria,
      minValue,
      maxValue,
      identificadorMaquininha,
      serialMaquininha,
      macaddressMaquininha,
      operadora
    } = req.body;

    // Inserindo no banco de dados via Prisma
    const novaMaquina = await prisma.configuracaoMaquina.create({
      data: {
        codigo,
        operacao,
        urlServidor,
        webhook01,
        webhook02,
        rotaConsultaStatusMaq,
        rotaConsultaAdimplencia,
        idMaquina,
        idCliente,
        valor1,
        valor2,
        valor3,
        valor4,
        textoEmpresa,
        corPrincipal,
        corSecundaria,
        minValue,
        maxValue,
        identificadorMaquininha,
        serialMaquininha,
        macaddressMaquininha,
        operadora
      },
    });

    res.json({ mensagem: 'Maquina inserida com sucesso', novaMaquina });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao inserir a máquina' });
  }
});

app.get('/buscar-maquininha/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    // Busca a máquina pelo código
    const maquina = await prisma.configuracaoMaquina.findUnique({
      where: {
        codigo: codigo,
      },
    });

    if (!maquina) {
      return res.status(404).json({ mensagem: 'Maquina não encontrada' });
    }

    res.json({ maquina });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar a máquina' });
  }
});


// Rota para atualizar informações de uma máquina pelo código
app.put('/alterar-maquininha/:codigo', verifyJwtPessoa, async (req, res) => {
  try {
    const { codigo } = req.params;  // Pega o código da URL
    const {
      operacao,
      urlServidor,
      webhook01,
      webhook02,
      rotaConsultaStatusMaq,
      rotaConsultaAdimplencia,
      idMaquina,
      idCliente,
      valor1,
      valor2,
      valor3,
      valor4,
      textoEmpresa,
      corPrincipal,
      corSecundaria,
      minValue,
      maxValue,
      identificadorMaquininha,
      serialMaquininha,
      macaddressMaquininha,
      operadora
    } = req.body;  // Pega os dados do corpo da requisição

    // Verifica se a máquina existe
    const maquinaExistente = await prisma.configuracaoMaquina.findUnique({
      where: { codigo },
    });

    if (!maquinaExistente) {
      return res.status(404).json({ mensagem: 'Maquina não encontrada' });
    }

    // Atualiza a máquina com os novos dados
    const maquinaAtualizada = await prisma.configuracaoMaquina.update({
      where: { codigo },
      data: {
        operacao,
        urlServidor,
        webhook01,
        webhook02,
        rotaConsultaStatusMaq,
        rotaConsultaAdimplencia,
        idMaquina,
        idCliente,
        valor1,
        valor2,
        valor3,
        valor4,
        textoEmpresa,
        corPrincipal,
        corSecundaria,
        minValue,
        maxValue,
        identificadorMaquininha,
        serialMaquininha,
        macaddressMaquininha,
        operadora
      },
    });

    res.json({ mensagem: 'Maquina atualizada com sucesso', maquinaAtualizada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar a máquina' });
  }
});


app.delete('/deletar-maquininha/:codigo', verifyJwtPessoa, async (req, res) => {
  try {
    const { codigo } = req.params;  // Pega o código da URL

    // Verifica se a máquina existe
    const maquinaExistente = await prisma.configuracaoMaquina.findUnique({
      where: { codigo },
    });

    if (!maquinaExistente) {
      return res.status(404).json({ mensagem: 'Maquina não encontrada' });
    }

    // Exclui a máquina
    await prisma.configuracaoMaquina.delete({
      where: { codigo },
    });

    res.json({ mensagem: 'Maquina excluída com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir a máquina' });
  }
});

// Rota GET para verificar se a máquina está online ou offline
app.get('/is-online/:idMaquina', async (req, res) => {
  try {
    const { idMaquina } = req.params;

    // Busca a máquina no banco de dados pelo id
    const maquina = await prisma.pix_Maquina.findUnique({
      where: {
        id: idMaquina,
      },
      include: {
        cliente: true,
      },
    });

    // Verificando se a máquina foi encontrada
    if (!maquina) {
      return res.status(404).json({ msg: 'Máquina não encontrada!' });
    }

    // Verifica o status da máquina com base na última requisição
    if (maquina.ultimaRequisicao) {
      const status = tempoOffline(new Date(maquina.ultimaRequisicao)) > 60 ? "OFFLINE" : "ONLINE";
      console.log(`Status da máquina: ${status}`);
      return res.status(200).json({ idMaquina, status });
    } else {
      console.log("Máquina sem registro de última requisição");
      return res.status(400).json({ msg: "MÁQUINA OFFLINE! Sem registro de última requisição." });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao verificar o status da máquina.' });
  }
});



// Função para calcular a diferença em dias
function calcularDiferencaEmDias(dataVencimento: Date): number {
  const hoje = new Date();
  const diferencaEmMilissegundos = hoje.getTime() - new Date(dataVencimento).getTime();
  const diferencaEmDias = diferencaEmMilissegundos / (1000 * 60 * 60 * 24);
  return Math.floor(diferencaEmDias);
}

// Rota GET para verificar se o cliente está com mensalidade atrasada
app.get('/is-client-ok/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Busca o cliente pelo ID
    const cliente = await prisma.pix_Cliente.findUnique({
      where: { id },
    });

    if (!cliente) {
      return res.status(404).json({ status: null });
    }

    // Verifica se o cliente está ativo
    if (!cliente.ativo) {
      return res.status(400).json({ status: null });
    }

    // Verifica se a data de vencimento está definida e calcula a diferença em dias
    if (cliente.dataVencimento) {
      const diferencaEmDias = calcularDiferencaEmDias(cliente.dataVencimento);

      if (diferencaEmDias > 10) {
        return res.json({ status: false });
      } else {
        return res.json({ status: true });
      }
    } else {
      return res.status(400).json({ status: null });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: null });
  }
});


// Rota POST para gerar um pagamento PIX via Mercado Pago
app.post('/mp-qrcode-generator/:id/:maquina', async (req, res) => {
  try {
    // Verifica se o valor foi passado no querystring
    const valor = req.query.valor;

    // Garantir que o valor seja uma string
    if (typeof valor !== 'string') {
      return res.status(400).json({ status: "Valor não informado ou inválido!" });
    }

    // Buscar token do cliente no banco de dados usando Prisma
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.params.id,
      }
    });

    // Verifica se o cliente foi encontrado
    if (!cliente) {
      return res.status(404).json({ status: "Cliente não encontrado!" });
    }

    const tokenCliente = cliente.mercadoPagoToken ? cliente.mercadoPagoToken : "";

    if (!tokenCliente) {
      return res.status(403).json({ status: "Cliente sem token!" });
    }

    console.log("Token recuperado");

    // Configurar a requisição para criar a intenção de pagamento via PIX no Mercado Pago
    const mercadoPagoUrl = "https://api.mercadopago.com/v1/payments";
    const headers = {
      'Authorization': `Bearer ${tokenCliente}`,
      'Content-Type': 'application/json'
    };

    // Adicionando um identificador externo ao pagamento
    const externalReference = req.params.maquina;

    // Configurando os dados da intenção de pagamento, incluindo o identificador
    const pagamentoPix = {
      transaction_amount: parseFloat(valor),  // Usando o valor do query string
      description: "Pagamento via PIX",
      payment_method_id: "pix",  // Indicando que é um pagamento via PIX
      payer: { email: "email@gmail.com" },  // Informações do pagador (pode ser anônimo)
      external_reference: externalReference  // Identificador único para rastrear o pagamento
    };

    // Fazendo a requisição para criar a intenção de pagamento
    const response = await axios.post(mercadoPagoUrl, pagamentoPix, { headers });

    // Retornando os dados da intenção de pagamento, incluindo o QR code
    const paymentData = response.data;
    const qrCode = paymentData.point_of_interaction.transaction_data.qr_code;
    const qrCodeBase64 = paymentData.point_of_interaction.transaction_data.qr_code_base64;

    // Enviar os dados da transação para o cliente
    return res.status(200).json({
      status: "Pagamento PIX criado com sucesso",
      payment_data: paymentData,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      external_reference: externalReference  // Retornando o identificador
    });

  } catch (error: any) {
    console.error("Erro ao processar a requisição: ", error);
    return res.status(500).json({ status: "Erro interno de servidor", error: error.message });
  }
});

// Rota GET para verificar o status de pagamento
app.get('/verificar-pagamento/:idCliente/:idPagamento', async (req, res) => {
  try {
    // Buscar token do cliente no banco de dados usando Prisma
    const cliente = await prisma.pix_Cliente.findUnique({
      where: {
        id: req.params.idCliente,
      }
    });

    // Verifica se o cliente foi encontrado
    if (!cliente) {
      return res.status(404).json({ status: "Cliente não encontrado!" });
    }

    // Verifica se o cliente possui um token do Mercado Pago
    const tokenCliente = cliente.mercadoPagoToken ? cliente.mercadoPagoToken : "";
    if (!tokenCliente) {
      return res.status(403).json({ status: "Cliente sem token!" });
    }

    console.log("Token obtido.");

    // ID do pagamento a ser verificado
    const idPagamento = req.params.idPagamento;

    // URL da API do Mercado Pago para consultar o status do pagamento
    const mercadoPagoUrl = `https://api.mercadopago.com/v1/payments/${idPagamento}`;

    // Faz a requisição GET para a API do Mercado Pago com o token de autorização
    const headers = {
      'Authorization': `Bearer ${tokenCliente}`,
      'Content-Type': 'application/json'
    };

    // Fazendo a requisição para verificar o status do pagamento
    const response = await axios.get(mercadoPagoUrl, { headers });

    // Extrair o status do pagamento da resposta
    const statusPagamento = response.data.status;

    // Verificar se o status é 'approved' (pagamento realizado)
    if (statusPagamento === 'approved') {
      //processar pagamento
      //processamento do pagamento
      var valor = 0.00;
      var tipoPagamento = ``;
      var taxaDaOperacao = ``;
      var cliId = ``;
      var str_id = "";
      var mensagem = `MÁQUINA NÃO ENCONTRADA`;


      console.log("Novo pix do Mercado Pago:");
      console.log(req.body);

      console.log("id");
      console.log(req.query['data.id']);

      const { resource, topic } = req.body;

      // Exibe os valores capturados
      console.log('Resource:', resource);
      console.log('Topic:', topic);

      var url = "https://api.mercadopago.com/v1/payments/" + req.query['data.id'];

      console.log(cliente?.ativo);


      console.log('storetransaction_amount_id', response.data.transaction_amount);

      console.log('payment_method_id', response.data.payment_type_id);

      valor = response.data.transaction_amount;

      tipoPagamento = response.data.payment_type_id;

      console.log('external_reference', response.data.external_reference);

      if (response.data.fee_details && Array.isArray(response.data.fee_details) && response.data.fee_details.length > 0) {
        console.log('Amount:', response.data.fee_details[0].amount);
        taxaDaOperacao = response.data.fee_details[0].amount + "";
      }

      //BUSCAR QUAL MÁQUINA ESTÁ SENDO UTILIZADA (store_id)
      const maquina = await prisma.pix_Maquina.findFirst({
        where: {
          id: response.data.external_reference,
        },
        include: {
          cliente: true,
        },
      });

      //PROCESSAR O PAGAMENTO (se eu tiver uma máquina com store_id cadastrado)
      if (maquina && maquina.descricao) {

        console.log(`recebendo pagamento na máquina: ${maquina.nome} -  ${maquina.descricao}`)

        //VERIFICANDO SE A MÁQUINA PERTENCE A UM CIENTE ATIVO 
        if (cliente != null) {
          if (cliente !== null && cliente !== undefined) {
            if (cliente.ativo) {
              console.log("Cliente ativo - seguindo...");

              //VERIFICAÇÃO DA DATA DE VENCIMENTO:
              if (cliente.dataVencimento) {
                if (cliente.dataVencimento != null) {
                  console.log("verificando inadimplência...");
                  const dataVencimento: Date = cliente.dataVencimento;
                  const dataAtual = new Date();
                  const diferencaEmMilissegundos = dataAtual.getTime() - dataVencimento.getTime();
                  const diferencaEmDias = Math.floor(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));
                  console.log(diferencaEmDias);
                  if (diferencaEmDias > 10) {
                    console.log("Cliente MENSALIDADE atrasada - estornando...");

                    //EVITAR ESTORNO DUPLICADO
                    const registroExistente = await prisma.pix_Pagamento.findFirst({
                      where: {
                        mercadoPagoId: req.params.idPagamento,
                        estornado: true,
                        clienteId: req.params.idCliente
                      },
                    });

                    if (registroExistente) {
                      console.log("Esse estorno ja foi feito...");
                      // return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                      return res.status(200).json({ pago: false });

                    } else {
                      console.log("Seguindo...");
                    }
                    //FIM EVITANDO ESTORNO DUPLICADO

                    estornarMP(req.params.idPagamento, tokenCliente, "mensalidade com atraso");
                    //REGISTRAR O PAGAMENTO
                    const novoPagamento = await prisma.pix_Pagamento.create({
                      data: {
                        maquinaId: maquina.id,
                        valor: valor.toString(),
                        mercadoPagoId: req.params.idPagamento,
                        motivoEstorno: `01- mensalidade com atraso. str_id: ${str_id}`,
                        estornado: true,
                      },
                    });
                    // return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                    return res.status(200).json({ pago: false });

                  }
                }
                else {
                  console.log("pulando etapa de verificar inadimplência... campo dataVencimento não cadastrado ou nulo!")
                }
              }
              //FIM VERIFICAÇÃO VENCIMENTO

            } else {
              console.log("Cliente inativo - estornando...");

              //EVITAR ESTORNO DUPLICADO
              const registroExistente = await prisma.pix_Pagamento.findFirst({
                where: {
                  mercadoPagoId: req.params.idPagamento,
                  estornado: true,
                  clienteId: req.params.idCliente
                },
              });

              if (registroExistente) {
                console.log("Esse estorno ja foi feito...");
                //  return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
                return res.status(200).json({ pago: false });

              } else {
                console.log("Seguindo...");
              }
              //FIM EVITANDO ESTORNO DUPLICADO

              estornarMP(req.params.idPagamento, tokenCliente, "cliente inativo");
              //REGISTRAR O PAGAMENTO
              const novoPagamento = await prisma.pix_Pagamento.create({
                data: {
                  maquinaId: maquina.id,
                  valor: valor.toString(),
                  mercadoPagoId: req.params.idPagamento,
                  motivoEstorno: `02- cliente inativo. str_id: ${str_id}`,
                  estornado: true,
                },
              });
              // return res.status(200).json({ "retorno": "error.. cliente INATIVO - pagamento estornado!" });
              return res.status(200).json({ pago: false });

            }
          } else {
            console.log("error.. cliente nulo ou não encontrado!");
            // return res.status(200).json({ "retorno": "error.. cliente nulo ou não encontrado!" });
            return res.status(200).json({ pago: false });

          }
        }
        //FIM VERIFICAÇÃO DE CLIENTE ATIVO.

        //VERIFICANDO SE A MÁQUINA ESTÁ OFFLINE 
        if (maquina.ultimaRequisicao instanceof Date) {
          const diferencaEmSegundos = tempoOffline(maquina.ultimaRequisicao);
          if (diferencaEmSegundos > 60) {
            console.log("estornando... máquina offline.");

            //EVITAR ESTORNO DUPLICADO
            const registroExistente = await prisma.pix_Pagamento.findFirst({
              where: {
                mercadoPagoId: req.params.idPagamento,
                estornado: true,
              },
            });

            if (registroExistente) {
              console.log("Esse estorno ja foi feito...");
              //return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
              return res.status(200).json({ pago: false });

            } else {
              console.log("Seguindo...");
            }
            //FIM EVITANDO ESTORNO DUPLICADO

            estornarMP(req.params.idPagamento, tokenCliente, "máquina offline");
            //evitando duplicidade de estorno:
            const estornos = await prisma.pix_Pagamento.findMany({
              where: {
                mercadoPagoId: req.params.idPagamento,
                estornado: true,
                clienteId: req.params.idCliente
              },
            });

            if (estornos) {
              if (estornos.length > 0) {
                // return res.status(200).json({ "retorno": "PAGAMENTO JÁ ESTORNADO! - MÁQUINA OFFLINE" });
                return res.status(200).json({ pago: false });
              }
            }
            //FIM envitando duplicidade de estorno
            //REGISTRAR ESTORNO
            const novoPagamento = await prisma.pix_Pagamento.create({
              data: {
                maquinaId: maquina.id,
                valor: valor.toString(),
                mercadoPagoId: req.params.idPagamento,
                motivoEstorno: `03- máquina offline. str_id: ${str_id}`,
                estornado: true,
              },
            });
            // return res.status(200).json({ "retorno": "PAGAMENTO ESTORNADO - MÁQUINA OFFLINE" });
            return res.status(200).json({ pago: false });

          }
        } else {
          console.log("estornando... máquina offline.");

          //EVITAR ESTORNO DUPLICADO
          const registroExistente = await prisma.pix_Pagamento.findFirst({
            where: {
              mercadoPagoId: req.params.idPagamento,
              estornado: true,
              clienteId: req.params.idCliente
            },
          });

          if (registroExistente) {
            console.log("Esse estorno ja foi feito...");
            // return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
            return res.status(200).json({ pago: false });

          } else {
            console.log("Seguindo...");
          }
          //FIM EVITANDO ESTORNO DUPLICADO

          estornarMP(req.params.idPagamento, tokenCliente, "máquina offline");
          //REGISTRAR O PAGAMENTO
          const novoPagamento = await prisma.pix_Pagamento.create({
            data: {
              maquinaId: maquina.id,
              valor: valor.toString(),
              mercadoPagoId: req.params.idPagamento,
              motivoEstorno: `04- máquina offline. str_id: ${str_id}`,
              estornado: true,
            },
          });
          // return res.status(200).json({ "retorno": "PAGAMENTO ESTORNADO - MÁQUINA OFFLINE" });
          return res.status(200).json({ pago: false });

        }
        //FIM VERIFICAÇÃO MÁQUINA OFFLINE

        //VERIFICAR SE O VALOR PAGO É MAIOR QUE O VALOR MÍNIMO

        const valorMinimo = parseFloat(maquina.valorDoPulso);
        if (valor < valorMinimo) {
          console.log("iniciando estorno...")

          //EVITAR ESTORNO DUPLICADO
          const registroExistente = await prisma.pix_Pagamento.findFirst({
            where: {
              mercadoPagoId: req.params.idPagamento,
              estornado: true,
              clienteId: req.params.idCliente
            },
          });

          if (registroExistente) {
            console.log("Esse estorno ja foi feito...");
            // return res.status(200).json({ "retorno": "error.. cliente ATRASADO - mais de 10 dias sem pagamento!" });
            return res.status(200).json({ pago: false });

          } else {
            console.log("Seguindo...");
          }
          //FIM EVITANDO ESTORNO DUPLICADO


          //REGISTRAR O PAGAMENTO
          const novoPagamento = await prisma.pix_Pagamento.create({
            data: {
              maquinaId: maquina.id,
              valor: valor.toString(),
              mercadoPagoId: req.params.idPagamento,
              motivoEstorno: `05- valor inferior ao mínimo. str_id: ${str_id}`,
              estornado: true,
            },
          });
          console.log("estornando valor inferior ao mínimo...");

          estornarMP(req.params.idPagamento, tokenCliente, "valor inferior ao mínimo");
          return res.status(200).json({
            "retorno": `PAGAMENTO ESTORNADO - INFERIOR AO VALOR 
            MÍNIMO DE R$: ${valorMinimo} PARA ESSA MÁQUINA.`
          });
        } else {
          console.log("valor permitido finalizando operação...");
        }

        if (response.data.status != "approved") {
          console.log("pagamento não aprovado!");
          return;
        }

        //VERIFICAR SE ESSE PAGAMENTO JÁ FOI EFETUADO
        const registroExistente = await prisma.pix_Pagamento.findFirst({
          where: {
            mercadoPagoId: req.params.idPagamento,
            clienteId: req.params.idCliente
          },
        });

        if (registroExistente) {
          console.log("Esse pagamento ja foi feito...");
          // return res.status(200).json({ "retorno": "error.. Duplicidade de pagamento!" });
          return res.status(200).json({ pago: true });

        } else {
          console.log("Seguindo...");
        }
        //VERIFICAR SE ESSE PAGAMENTO JÁ FOI EFETUADO

        //ATUALIZAR OS DADOS DA MÁQUINA QUE ESTAMOS RECEBENDO O PAGAMENTO
        await prisma.pix_Maquina.update({
          where: {
            id: maquina.id,
          },
          data: {
            valorDoPix: valor.toString(),
            ultimoPagamentoRecebido: new Date(Date.now())
          }
        });

        //REGISTRAR O PAGAMENTO
        const novoPagamento = await prisma.pix_Pagamento.create({
          data: {
            maquinaId: maquina.id,
            valor: valor.toString(),
            mercadoPagoId: req.params.idPagamento,
            motivoEstorno: ``,
            tipo: tipoPagamento,
            taxas: taxaDaOperacao,
            clienteId: req.params.idCliente,
            estornado: false,
            operadora: `Mercado Pago`
          },
        });

        if (NOTIFICACOES_PAGAMENTOS) {
          notificarDiscord(NOTIFICACOES_PAGAMENTOS, `Novo pagamento recebido no Mercado Pago. Via APP. R$: ${valor.toString()}`, `Cliente ${cliente?.nome} Maquina: ${maquina?.nome}. Maquina: ${maquina?.descricao}`)
        }

        console.log('Pagamento inserido com sucesso:', novoPagamento);
        // return res.status(200).json(novoPagamento);
        return res.status(200).json({ pago: true });


      } else {

        //PROCESSAMENTO DE EVENTOS QUE NÃO SAO PAYMENTS DE LOJAS E CAIXAS


        console.log("Máquina não encontrada");
        // return res.status(200).json({ "retorno": mensagem });
        return res.status(404).json({ pago: false });

      }





      //fim procesar pagamento
    } else {
      return res.status(200).json({ pago: false });
    }

  } catch (error: any) {
    console.error("Erro ao verificar o pagamento: ", error);
    return res.status(500).json({ status: "Erro ao verificar o pagamento", error: error.message });
  }
});









//código escrito por Lucas Carvalho

//git add . 

//git commit -m "msg"

//git push 

app.listen(PORT, () => console.log(`localhost:${PORT}`)); 
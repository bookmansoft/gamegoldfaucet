var express = require('express');
var compression = require('compression');
var session = require('express-session');
var fileStore = require('session-file-store')(session);
var bodyParser = require('body-parser');
var request = require('request');
var svgCaptcha = require('svg-captcha');
var app = express();

var fs = require('fs');
var CronJob = require('cron').CronJob;
const cookieParser = require('cookie-parser');
const tookit = require('gamegoldtoolkit');

function shouldCompress (req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false
  }

  // fallback to standard filter function
  return compression.filter(req, res)
}

// compress all responses
app.use(compression({filter: shouldCompress}))
app.use('/css', express.static('css'));
app.use('/img', express.static('img'));
app.use('/lib', express.static('lib'));
app.use('/fonts', express.static('fonts'));
app.use(express.static('public'));

app.use( bodyParser.json() );                           // to support JSON-encoded bodies
app.use( bodyParser.urlencoded({ extended: true }) );   // to support URL-encoded bodies

const captchaUrl = '/captcha.jpg'
const captchaId = 'captcha'
const captchaFieldName = 'captcha' 
const ggdAddress ="ggdAddress"

// 定义验证码配置信息
const captchaOption = {
  size: 4, // 验证码长度
  ignoreChars: '0o1i’', // 验证码字符中排除 0o1i
  noise: 3, // 干扰线条的数量
  color: true, // 验证码的字符是否有颜色，默认没有，如果设定了背景，则默认有
  background: '#cc9966', // 验证码图片背景颜色
  fontSize: 80,
  width: 200,
  height: 100
}

app.use(cookieParser())

var faucetHistory = {};
var config = {};
function readConfig(){
  const obj=JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  config = obj;
}

readConfig();

var balanceCache; //用来缓存当余额
//获取授权式连接器
var remote = new toolkit.conn();

//设置连接参数
remote.setup({
  type:   config.netWorkType,            //对等网络类型，分为 testnet 和 main
  ip:     config.gameGoldNode,          //远程全节点地址
  apiKey: config.apiKey,        //远程全节点基本校验密码
  id:     config.walletId,            //默认访问的钱包编号
  cid:    config.accountId, //授权节点编号，用于访问远程钱包时的认证
  token:  config.accountToken, //授权节点令牌固定量，用于访问远程钱包时的认证
});

remote.setFetch(require('node-fetch')); //设置node环境下兼容的fetch函数

// app.set('trust proxy', 1) // trust first proxy
app.use(session({  
  secret: config.captchaSecret,
  proxy: true,
  key: 'session.sid',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true , maxAge: 60000 },
  store: new fileStore()
}))

var job = new CronJob({
  cronTime: '* */59 * * * *',
  onTick: function() {
    for (var storeAddress in faucetHistory) {
      if ( faucetHistory.hasOwnProperty(storeAddress) ) {
        var now = new Date().getTime();
        //86400000 = 1 day
        if(now - faucetHistory[storeAddress].timestamp >= 86400000) {
          delete faucetHistory[storeAddress];
        }
      }
    }
  }, start: false, timeZone: 'America/Los_Angeles'});
job.start();

function executeTransfer(destinationAddress) {
  //查询账户余额
  remote.execute('tx.send', buildParam(destinationAddress)).then (tx =>  {       
    // 转账的第一个输出为收款方金额 
    return tx.outputs[0].value;
  });
}

function buildParam(destinationAddress) {
  var money = estimatePrice();
  
  return [destinationAddress,money];
}


// 测算转多少给地址
function estimatePrice(){  
  if(balanceCache > 1000000000000){
    // 还很有钱.
    return Math.floor(((1 + Math.random())*100000000));
  }
  else{
    // 转余额的1/1000
    return balanceCache/1000;
  }
}

function accountAlreadyUsed(account) {
    var acc = account.toLowerCase(); 
    return acc in faucetHistory;
}

function isValidGGDAddress(address) {
  if (address === 'tb0000000000000000000000000000000000000000') {
    return false;
  }
  if (address.substring(0, 2) !== 'tb') {
    return false;
  } else if (!/^(tb)?[0-9a-z]{40}$/i.test(address)) {
    return false;
  } else if (/^(tb)?[0-9a-z]{40}$/.test(address) || /^(tb)?[0-9A-F]{40}$/.test(address)) {
    return true;
  }
  return false;  
}

function getImage(req,res){
  const cap = svgCaptcha.create(captchaOption);     
  req.session[captchaId] = cap.text; // session 存储 
  res.type('svg'); // 响应的类型
  console.log('getImage'+JSON.stringify(req.session)+" ID:"+req.sessionID);
  res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');

  res.send(cap.data);
};

app.use('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/*', function (req, res, next) {

  if (   req.url.indexOf("/img/") === 0
      || req.url.indexOf("/lib/") === 0
      || req.url.indexOf("/fonts/") === 0
      || req.url.indexOf("/css/font-awesome/css/") === 0
      || req.url.indexOf("/css/font-awesome/fonts/") === 0
      || req.url.indexOf("/css/") === 0
      ) {
    res.setHeader("Cache-Control", "public, max-age=300000");
    res.setHeader("Expires", new Date(Date.now() + 300000).toUTCString());
  }
  next();
});

// 这里是验证码
app.get(captchaUrl, getImage);

// 这里是读取当前水龙头余额
app.get('/balance', function (req, res) {
  //查询账户余额
  try{
     remote.execute('balance.all', []).then (ret =>  {
        var balance = ret.unconfirmed;
        balanceCache = balance;
        return res.status(200).send(String(balance));
     });
  }
  catch(err){
    res.status(400).send('We can not tranfer any amount right now. Try again later.');
  }
});



// 这里是post提交,需要验证地址和验证码
app.post('/', function (req, res) {
  // 水龙头没钱了
  if(!balanceCache || balanceCache< 10000000000){
    return res.status(400).send('We can not tranfer any amount right now. Try again later.' + req.body.ggdAddress + '.');
  }
  if(req.body[ggdAddress] === undefined || req.body[ggdAddress] === '' || req.body[ggdAddress]=== null) {
    console.log('No req.addrress');
    return res.status(400).send("Please complete addrress.");
  }

  if(req.body[captchaFieldName] === undefined || req.body[captchaFieldName] === '' || req.body[captchaFieldName] === null) {
    console.log('No req.body.' + captchaFieldName);
    return res.status(400).send("Please complete captcha.");
  }

  const address = req.body.ggdAddress;
  const captchaString = req.body[captchaFieldName];

  if (accountAlreadyUsed(address)) {
    console.log('Address already used today:', address);
    return res.status(400).send('Address already used today.');
  }

  var isSyncing = false;
  if(!isSyncing) {
    // Success will be true or false depending upon captcha validation.
    console.log('Psotmage'+JSON.stringify(req.session)+" ID:"+req.sessionID);
    var captcha = req.session[captchaId];
    if(!captcha){
      return res.status(400).send("Captcha Expired,refresh it.");
    }
    
    if(captcha.toLowerCase() != captchaString.toLowerCase()){
      return res.status(400).send("Failed captcha verification.");
    }
    
    console.log('Sending GameGold to ' + address);
    console.log('Captcha ' + captchaString);

    if(!isValidGGDAddress(address)){
      return res.status(400).send("Error gamegold address:"+address);
    }

    executeTransfer(address);

    faucetHistory[address.toLowerCase()] = {timestamp: new Date().getTime()};
    res.send('Successfully sent some GameGold to ' + address + '.');
  
  }
});

app.listen(config.port, function () {
  console.log('GameGold Faucet started on port ' + config.port);
});

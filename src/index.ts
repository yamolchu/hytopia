const { random } = require('user-agents');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const { Worker, workerData, isMainThread } = require('worker_threads');
const { faker } = require('@faker-js/faker');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const config = require('../inputs/config.ts');

const csvWriter = createCsvWriter({
  path: './result.csv',
  header: [
    { id: 'email', title: 'Email' },
    { id: 'proxy', title: 'Proxy' },
  ],
  append: true,
});

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
const numThreads = config.numThreads;
const customDelay = config.customDelay;

function parseEmails(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const emails: { email: string; imapPass: string }[] = [];

  lines.forEach((line: string) => {
    const [email = '', imapPass = ''] = line.split(':');
    emails.push({ email: email.trim(), imapPass: imapPass.trim() });
  });

  return emails;
}
function parseProxies(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const proxies: string[] = [];

  lines.forEach((line: string) => {
    const proxy = line.trim();
    proxies.push(proxy);
  });

  return proxies;
}
const emails = parseEmails('./inputs/emails.txt');
const proxies = parseProxies('./inputs/proxies.txt');

async function reg(email: any, proxy: string) {
  const headers = {
    'user-agent': random().toString(),
    host: 'preregister.hytopia.com',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,uk;q=0.8',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    origin: 'https://preregister.hytopia.com',
    referer: `https://preregister.hytopia.com/${config.ref}/`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
  };
  const session = axios.create({
    headers: headers,
    httpsAgent:
      config.proxyType === 'http' ? new HttpsProxyAgent(`http://${proxy}`) : new SocksProxyAgent(`socks5://${proxy}`),
  });

  const res1 = await axios.post('https://api.capsolver.com/createTask', {
    clientKey: config.capsolverAPIKey,
    task: {
      type: 'ReCaptchaV3EnterpriseTask',
      websiteURL: 'https://preregister.hytopia.com',
      websiteKey: '6Leqr00oAAAAAN3ItHtrGkMpHiOtENMkG87lq2fq',
      pageAction: 'homepage',
      proxy: config.proxyType === 'http' ? `http://${proxy}` : `socks5://${proxy}`,
    },
  });
  const taskId = res1.data.taskId;
  await delay(config.captchaDelay);
  const res2 = await axios.post('https://api.capsolver.com/getTaskResult', {
    clientKey: config.capsolver,
    taskId: taskId,
  });
  const captcha = res2.data.solution.gRecaptchaResponse;
  const FormData = require('form-data');
  const formData = new FormData();
  const genName = () => {
    const randomName = faker.person.lastName();
    const randomChars = getRandomChars(5);
    function getRandomChars(length: number) {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars.charAt(randomIndex);
      }
      return result;
    }
    const nameWithChars = randomName + randomChars;
    return nameWithChars;
  };

  formData.append('username', await genName());
  formData.append('email', email.email);
  formData.append('g-recaptcha-response', captcha);
  const res = await session.post(`https://preregister.hytopia.com/${config.ref}/?_data=player-by-referrer`, formData);
  console.log(res.data);

  const resultData = [
    {
      email: email.email,
      proxy: proxy,
    },
  ];
  await csvWriter
    .writeRecords(resultData)
    .then(() => {
      console.log('CSV file has been saved.');
    })
    .catch((error: any) => {
      console.error(error);
    });
}

function regRecursive(emails: any, proxies: any, index = 0, numThreads = 4) {
  if (index >= emails.length) {
    return;
  }

  const worker = new Worker(__filename, {
    workerData: { email: emails[index], proxy: proxies[index] },
  });
  worker.on('message', (message: any) => {
    console.log(message);
  });
  worker.on('error', (error: any) => {
    console.error(error);
  });
  worker.on('exit', (code: any) => {
    if (code !== 0) {
      console.error(`Thread Exit ${code}`);
    }
    regRecursive(emails, proxies, index + numThreads, numThreads);
  });
}
const main = async () => {
  if (isMainThread) {
    for (let i = 0; i < numThreads; i++) {
      await delay(customDelay);
      regRecursive(emails, proxies, i, numThreads);
    }
  } else {
    await delay(customDelay);
    const { email, proxy } = workerData;
    reg(email, proxy);
  }
};
main();

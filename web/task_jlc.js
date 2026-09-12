/**
 * 嘉立创
 * 官网：https://m.jlc.com/mapp/
 * 小程序：嘉立创下单助手
 *
 * 抓包 Host：https://m.jlc.com 获取请求头 x-jlc-accesstoken 和 secretkey 的值, 用 # 分割
 * export JLC_TOKEN = '2616xx-xxx-xxx#xxxxxxxxxxxxxxx'
 * 多账号用 & 或换行
 *
 * const $ = new Env('嘉立创')
 * cron: 30 6 * * *
 */
const initScript = require('../utils/initScript')
const {$, notify, common, checkUpdate} = initScript('嘉立创');
const jlcToken = process.env.JLC_TOKEN ? process.env.JLC_TOKEN.split(/[\n&]/) : [];
// 信息推送
let message = '';
// 接口地址
const baseUrl = 'https://m.jlc.com'
// 请求头
const headers = {
    'user-agent': common.getRandomUserAgent('PC'),
    // 'accept-encoding': 'gzip, deflate, br, zstd',
    'x-jlc-clienttype': 'WEB',
    'accept': 'application/json, text/plain, */*',
    'Referer': 'https://m.jlc.com/mapp/pages/my/index',
}

!(async () => {
    await checkUpdate($.name, jlcToken);
    for (let i = 0; i < jlcToken.length; i++) {
        const index = i + 1;
        const [tokens, secretKey] = jlcToken[i].split('#');
        headers['x-jlc-accesstoken'] = tokens;
        headers['secretkey'] = secretKey;
        console.log(`\n*****第[${index}]个${$.name}账号*****`);
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await main();
        await $.wait(common.getRandomWait(2000, 2500));
    }
    if (message) {
        await notify.sendNotify(`「${$.name}」`, `${message}`);
    }
})().catch((e) => $.logErr(e)).finally(() => $.done());

async function main() {
    await getUserInfo();
    await $.wait(common.getRandomWait(1000, 1500));
    await checkSign();
    await $.wait(common.getRandomWait(1000, 1500));
    await getPoints();
}

/**
 * 获取用户信息
 *
 * @returns {Promise<void>}
 */
async function getUserInfo() {
    try {
        const data = await common.sendRequest(`${baseUrl}/api/appPlatform/center/setting/selectPersonalInfo`, 'get', headers);
        if (!data.success) {
            console.error(data.message);
            return;
        }
        console.log(`昵称：${data.data.customerCode}`);
        message += `昵称：${data.data.customerCode}\n`;
    } catch (e) {
        console.error(`获取用户信息时发生异常：${e}`);
    }
}

/**
 * 检测签到
 *
 * @returns {Promise<void>}
 */
async function checkSign() {
    try {
        const data = await common.sendRequest(`${baseUrl}/api/activity/sign/getCurrentUserSignInConfig`, 'get', headers, '');
        if (!data.success) {
            console.error(data.message);
            return;
        }
        if (data.data.haveSignIn) {
            console.error(`今日已签到`);
            message += `今日已签到\n`;
            return;
        }
        await $.wait(common.getRandomWait(2000, 2500));
        await sign();
    } catch (e) {
        console.error(`检测签到时发生异常：${e}`);
    }
}

/**
 * 签到
 *
 * @returns {Promise<void>}
 */
async function sign() {
    try {
        const data = await common.sendRequest(`${baseUrl}/api/activity/sign/signIn?source=4`, 'get', headers, '');
        if (!data.success) {
            console.error(data.message);
            return;
        }
        if (!data.data.gainNum) {
            console.log(`有奖励可领取，先领取奖励，默认选择类型2：金豆`);
            await $.wait(common.getRandomWait(1e3, 2e3));
            await receiveVoucher();
        } else {
            console.log(`签到成功，金豆+${data.data.gainNum}`);
            message += `签到成功，金豆+${data.data.gainNum}\n`;
        }
    } catch (e) {
        console.error(`签到时发生异常：${e}`);
    }
}

/**
 * 领取奖励
 *
 * @returns {Promise<void>}
 */
async function receiveVoucher() {
    try {
        const data = await common.sendRequest(`${baseUrl}/api/activity/sign/receiveVoucher`, 'get', headers, '');
        if (!data.success) {
            console.error(data.message);
            return;
        }
        console.log(`领取成功`);
        message += `领取成功\n`;
        await $.wait(common.getRandomWait(1e3, 2e3));
        await sign();
    } catch (e) {
        console.error(`领取奖励时发生异常：${e}`);
    }
}

/**
 * 获取金豆
 *
 * @returns {Promise<void>}
 */
async function getPoints() {
    try {
        const data = await common.sendRequest(`${baseUrl}/api/users/getSignInProfile?_t=${Date.now()}`, 'get', headers, '');
        if (!data.success) {
            console.error(data);
            return;
        }
        console.log(`当前积分：${data.result.total_point}`);
        message += `当前积分：${data.result.total_point}\n\n`;
    } catch (e) {
        console.error(`获取当前积分时发生异常：${e}`);
    }
}

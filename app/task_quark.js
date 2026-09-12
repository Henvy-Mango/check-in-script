/**
 * 夸克网盘
 *
 * App 抓包 Host：https://drive-m.quark.cn
 * 访问抽奖页，复制 /1/clouddrive/act/growth/reward 请求的完整 URL
 * export QUARK_COOKIE = 'user=张三; url=https://drive-m.quark.cn/1/clouddrive/act/growth/reward?...&kps=xxx&sign=xxx&vcode=xxx;'
 * 也兼容旧格式：user=张三; kps=xxx; sign=xxx; vcode=xxx;
 * 多账号用 && 或换行
 *
 * const $ = new Env('夸克自动签到')
 * cron: 0 9 * * *
 */
const initScript = require('../utils/initScript')
const {$, notify, common, checkUpdate} = initScript('夸克自动签到');
const quarkToken = process.env.QUARK_COOKIE ? process.env.QUARK_COOKIE.split(/\n|&&/).map((item) => item.trim()).filter(Boolean) : [];
// 信息推送
let message = '';
// 接口地址
const baseUrl = 'https://drive-m.quark.cn/1/clouddrive/capacity/growth'
// 请求头
const headers = {
    'user-agent': common.getRandomUserAgent('H5'),
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json',
}

!(async () => {
    await checkUpdate($.name, quarkToken);
    for (let i = 0; i < quarkToken.length; i++) {
        const index = i + 1;
        console.log(`\n*****第[${index}]个${$.name}账号*****`);
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await main(quarkToken[i], index);
        await $.wait(common.getRandomWait(2000, 2500));
    }
    if (message) {
        await notify.sendNotify(`「${$.name}」`, `${message}`);
    }
})().catch((e) => $.logErr(e)).finally(() => $.done());

/**
 * 执行签到
 *
 * @param {string} token 账号配置
 * @param {number} index 账号序号
 * @returns {Promise<void>}
 */
async function main(token, index) {
    try {
        const account = parseAccount(token);
        const missingParams = ['kps', 'sign', 'vcode'].filter((key) => !account[key]);
        if (missingParams.length) {
            throw new Error(`缺少参数：${missingParams.join(', ')}`);
        }
        if (account.user) {
            console.log(`用户：${account.user}`);
            message += `用户：${account.user}\n`;
        }
        const growthInfo = await getGrowthInfo(account);
        showCapacity(growthInfo);
        await signIn(account, growthInfo);
        message += '\n';
    } catch (e) {
        const error = getErrorMessage(e);
        console.error(`账号[${index}]签到时发生异常：${error}`);
        message += `签到失败：${error}\n\n`;
    }
}

/**
 * 获取用户容量和签到信息
 *
 * @param {object} account 账号参数
 * @returns {Promise<object>}
 */
async function getGrowthInfo(account) {
    const data = await common.sendRequest(`${baseUrl}/info?${getQueryString(account)}`, 'get', headers);
    if (!data.data) {
        throw new Error(data.message || data.msg || '获取成长信息失败');
    }
    return data.data;
}

/**
 * 输出容量信息
 *
 * @param {object} growthInfo 成长信息
 */
function showCapacity(growthInfo) {
    const userType = growthInfo['88VIP'] ? '88VIP' : '普通用户';
    const signReward = growthInfo.cap_composition?.sign_reward || 0;
    console.log(`用户类型：${userType}`);
    console.log(`网盘总容量：${convertBytes(growthInfo.total_capacity)}`);
    console.log(`签到累计容量：${convertBytes(signReward)}`);
    message += `用户类型：${userType}\n`;
    message += `💾网盘总容量：${convertBytes(growthInfo.total_capacity)}\n`;
    message += `签到累计容量：${convertBytes(signReward)}\n`;
}

/**
 * 签到
 *
 * @param {object} account 账号参数
 * @param {object} growthInfo 成长信息
 * @returns {Promise<void>}
 */
async function signIn(account, growthInfo) {
    const signInfo = growthInfo.cap_sign;
    if (!signInfo) {
        throw new Error('签到信息不完整');
    }
    if (signInfo.sign_daily) {
        const result = `今日已签到+${convertBytes(signInfo.sign_daily_reward)}，连签进度(${signInfo.sign_progress}/${signInfo.sign_target})`;
        console.log(result);
        message += `✅${result}\n`;
        return;
    }

    const data = await common.sendRequest(`${baseUrl}/sign?${getQueryString(account)}`, 'post', headers, {
        sign_cyclic: true,
    });
    if (!data.data) {
        throw new Error(data.message || data.msg || '签到接口返回异常');
    }
    const result = `签到成功+${convertBytes(data.data.sign_daily_reward)}，连签进度(${signInfo.sign_progress + 1}/${signInfo.sign_target})`;
    console.log(result);
    message += `✅${result}\n`;
}

/**
 * 解析账号配置
 *
 * @param {string} token 账号配置
 * @returns {object}
 */
function parseAccount(token) {
    const account = {};
    token.split(';').forEach((item) => {
        const separator = item.indexOf('=');
        if (separator === -1) return;
        const key = item.slice(0, separator).trim();
        const value = item.slice(separator + 1).trim();
        if (key) account[key] = value;
    });
    if (account.url) {
        const params = new URL(account.url).searchParams;
        ['kps', 'sign', 'vcode'].forEach((key) => {
            account[key] = params.get(key) || account[key];
        });
    }
    return account;
}

/**
 * 生成移动端接口查询参数
 *
 * @param {object} account 账号参数
 * @returns {string}
 */
function getQueryString(account) {
    return new URLSearchParams({
        pr: 'ucpro',
        fr: 'android',
        kps: account.kps,
        sign: account.sign,
        vcode: account.vcode,
    }).toString();
}

/**
 * 字节容量转换
 *
 * @param {number} bytes 字节数
 * @returns {string}
 */
function convertBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let value = Number(bytes) || 0;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }
    return `${value.toFixed(2)} ${units[index]}`;
}

/**
 * 提取请求异常信息
 *
 * @param {*} error 异常
 * @returns {string}
 */
function getErrorMessage(error) {
    return error.response?.data?.message || error.response?.data?.msg || error.message || error;
}

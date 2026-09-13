/**
 * 哔咔漫画
 *
 * 环境变量：PICACOMIC_ACCOUNT='用户名#密码'
 * 多账号用 & 或换行分隔，例如：用户名1#密码1&用户名2#密码2
 * const $ = new Env('哔咔漫画自动签到')
 * cron: 30 8 * * *
 */
const crypto = require('crypto');
const initScript = require('../utils/initScript');
const {$, notify, common, checkUpdate} = initScript('哔咔漫画自动签到');

const accounts = process.env.PICACOMIC_ACCOUNT
    ? process.env.PICACOMIC_ACCOUNT.split(/[\n&]/).map((item) => item.trim()).filter(Boolean)
    : [];
let message = '';

const API_URL = 'https://picaapi.picacomic.com';
const API_KEY = 'C69BAF41DA5ABD1FFEDC6D2FEA56B';
const SECRET_KEY = '~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn';
const NONCE = crypto.randomUUID().replaceAll('-', '');

!(async () => {
    await checkUpdate($.name, accounts);
    for (let i = 0; i < accounts.length; i++) {
        const index = i + 1;
        console.log(`\n*****第[${index}]个${$.name}账号*****`);
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await run(accounts[i], index);
        await $.wait(common.getRandomWait(2000, 2500));
    }
    if (message) {
        await notify.sendNotify(`「${$.name}」`, message);
    }
})().catch((e) => $.logErr(e)).finally(() => $.done());

/**
 * 执行登录和签到。
 *
 * @param {string} account 账号配置
 * @param {number} index 账号序号
 * @returns {Promise<void>}
 */
async function run(account, index) {
    try {
        const {username, password} = parseAccount(account);
        const token = await login(username, password);
        console.log('哔咔登录成功');

        const profile = await getProfile(token);
        if (profile?.isPunched) {
            reportSuccess('今日已签到');
            return;
        }

        let punchData;
        try {
            punchData = await request('users/punch-in', 'POST', token, {});
        } catch (e) {
            // 部分接口会在已签到时返回 400 和无意义的“--”，以用户资料为准。
            const updatedProfile = await getProfile(token);
            if (updatedProfile?.isPunched) {
                reportSuccess('今日已签到');
                return;
            }
            throw e;
        }
        if (punchData?.message !== 'success') {
            const updatedProfile = await getProfile(token);
            if (updatedProfile?.isPunched) {
                reportSuccess('今日已签到');
                return;
            }
            throw new Error(formatApiError(punchData));
        }

        const status = punchData?.data?.res?.status || '成功';
        reportSuccess(`签到成功：${status}`);
    } catch (e) {
        const error = getErrorMessage(e);
        console.error(`账号[${index}]运行异常：${error}`);
        message += `❌签到失败：${error}\n\n`;
    }
}

/**
 * 获取个人资料，用于判断当天是否已经签到。
 *
 * @param {string} token 授权令牌
 * @returns {Promise<object|null>}
 */
async function getProfile(token) {
    try {
        const profileData = await request('users/profile', 'GET', token);
        return profileData?.data?.user || null;
    } catch (e) {
        console.warn(`获取签到状态失败，将尝试直接签到：${getErrorMessage(e)}`);
        return null;
    }
}

/**
 * 输出并记录成功结果。
 *
 * @param {string} result 签到结果
 */
function reportSuccess(result) {
    console.log(`哔咔${result}`);
    message += `✅${result}\n\n`;
}

/**
 * 登录并返回授权令牌。
 *
 * @param {string} username 登录用户名
 * @param {string} password 登录密码
 * @returns {Promise<string>}
 */
async function login(username, password) {
    const loginData = await request('auth/sign-in', 'POST', null, {
        email: username,
        password,
    });
    if (loginData?.message !== 'success' || !loginData?.data?.token) {
        throw new Error(loginData?.message || '登录失败');
    }
    return loginData.data.token;
}

/**
 * 发送哔咔 API 请求。
 *
 * @param {string} path API 路径
 * @param {string} method 请求方法
 * @param {?string} token 授权令牌
 * @param {?object} data 请求体
 * @returns {Promise<object>}
 */
async function request(path, method, token = null, data = null) {
    const options = {
        url: `${API_URL}/${path}`,
        method,
        headers: getHeaders(path, method, token),
        timeout: 20000,
        validateStatus: () => true,
    };
    if (data !== null && data !== undefined) options.data = data;

    const response = await common.request(options);
    if (response.status < 200 || response.status >= 300) {
        const error = new Error(formatApiError(response.data, response.status));
        error.response = response;
        throw error;
    }
    return response.data;
}

/**
 * 构建哔咔加密请求头。
 *
 * @param {string} path API 路径
 * @param {string} method 请求方法
 * @param {?string} token 授权令牌
 * @returns {object}
 */
function getHeaders(path, method, token = null) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const raw = `${path}${timestamp}${NONCE}${method}${API_KEY}`.toLowerCase();
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(raw).digest('hex');

    const headers = {
        'api-key': API_KEY,
        signature,
        time: timestamp,
        nonce: NONCE,
        'app-channel': '2',
        'app-version': '2.2.1.2.3.3',
        'app-uuid': 'defaultUuid',
        'app-platform': 'android',
        'app-build-version': '44',
        'User-Agent': 'okhttp/3.8.1',
        accept: 'application/vnd.picacomic.com.v1+json',
        'image-quality': 'original',
    };
    if (method.toUpperCase() !== 'GET') {
        headers['Content-Type'] = 'application/json; charset=UTF-8';
    }
    if (token) headers.authorization = token;
    return headers;
}

/**
 * 解析“用户名#密码”格式，密码中可包含 #。
 *
 * @param {string} account 账号配置
 * @returns {{username: string, password: string}}
 */
function parseAccount(account) {
    const separator = account.indexOf('#');
    if (separator <= 0 || separator === account.length - 1) {
        throw new Error('账号格式错误，应为：用户名#密码');
    }
    return {
        username: account.slice(0, separator).trim(),
        password: account.slice(separator + 1),
    };
}

/**
 * 提取请求异常信息。
 *
 * @param {*} error 异常
 * @returns {string}
 */
function getErrorMessage(error) {
    if (error.response?.data) {
        return formatApiError(error.response.data, error.response.status);
    }
    return error.message || String(error);
}

/**
 * 格式化 API 错误，避免服务端 message 为“--”时丢失真正的错误信息。
 *
 * @param {*} data API 响应体
 * @param {number} [httpStatus] HTTP 状态码
 * @returns {string}
 */
function formatApiError(data, httpStatus) {
    if (!data || typeof data !== 'object') {
        return data ? String(data) : `HTTP ${httpStatus || '请求异常'}`;
    }
    const details = [];
    if (data.detail && data.detail !== '--') details.push(data.detail);
    if (data.message && data.message !== '--') details.push(data.message);
    if (data.error) details.push(`error=${data.error}`);
    if (data.code) details.push(`code=${data.code}`);
    if (httpStatus) details.push(`HTTP ${httpStatus}`);
    if (!details.length && data.message === '--') {
        details.push('服务端返回 --');
    }
    return [...new Set(details.map(String))].join('；') || '接口返回异常';
}

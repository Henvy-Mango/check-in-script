/**
 * JMComic（禁漫天堂）
 *
 * 环境变量：JM_ACCOUNT='账号#密码'
 * 多账号用 & 或换行分隔，例如：账号1#密码1&账号2#密码2
 * 密码中可以包含 #。
 * 可选 API 节点：JM_API_DOMAIN='https://example.com'
 * 多个节点可用英文逗号、& 或换行分隔；未设置时使用上游内置节点。
 * const $ = new Env('JMComic自动签到')
 * cron: 10 8 * * *
 *
 * 签到协议参考：
 * https://github.com/BB-CHICKEN/venera-jm/blob/main/recode-jm.js
 */
const crypto = require('crypto');
const initScript = require('../utils/initScript');

const {$, notify, common, checkUpdate} = initScript('JMComic自动签到');

const accounts = process.env.JM_ACCOUNT
    ? process.env.JM_ACCOUNT.split(/[\n&]/).map((item) => item.trim()).filter(Boolean)
    : [];
let message = '';

const JM_VERSION = '2.0.16';
const JM_PACKAGE_NAME = 'com.example.app';
const JM_AUTH_KEY = '18comicAPPContent';
const JM_DATA_KEY = '185Hcomic3PAPP7R';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const FALLBACK_DOMAINS = [
    'www.cdnhjk.net',
    'www.cdngwc.cc',
    'www.cdngwc.net',
    'www.cdngwc.club',
    'www.cdnutc.me',
];

if (require.main === module) {
    main().catch((e) => $.logErr(e)).finally(() => $.done());
}

/**
 * 执行全部账号签到。
 *
 * @returns {Promise<void>}
 */
async function main() {
    await checkUpdate($.name, accounts);
    const domains = getApiDomains(process.env.JM_API_DOMAIN);
    for (let i = 0; i < accounts.length; i++) {
        const index = i + 1;
        console.log(`\n*****第[${index}]个${$.name}账号*****`);
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await run(accounts[i], index, domains);
        await $.wait(common.getRandomWait(2000, 2500));
    }
    if (message) {
        await notify.sendNotify(`「${$.name}」`, message);
    }
}

/**
 * 登录并签到；网络或节点异常时自动切换备用节点。
 *
 * @param {string} account 账号配置
 * @param {number} index 账号序号
 * @param {string[]} domains API 节点
 * @returns {Promise<void>}
 */
async function run(account, index, domains) {
    try {
        const {username, password} = parseAccount(account);
        let lastError;

        for (let i = 0; i < domains.length; i++) {
            const domain = domains[i];
            const client = new JmClient(domain);
            try {
                const loginData = await client.request('/login', 'POST', {
                    username,
                    password,
                });
                if (!loginData?.uid) {
                    const error = new Error(loginData?.msg || loginData?.errorMsg || '登录失败，未返回 uid');
                    error.retryable = false;
                    throw error;
                }
                console.log(`JM 登录成功（线路 ${i + 1}）`);

                const checkRecord = await client.request(`/daily?user_id=${encodeURIComponent(loginData.uid)}`);
                if (!Object.prototype.hasOwnProperty.call(checkRecord || {}, 'daily_id')) {
                    throw new Error('无效的签到标识，签到失败');
                }

                const checkResult = await client.request('/daily_chk', 'POST', {
                    user_id: loginData.uid,
                    daily_id: checkRecord.daily_id,
                });
                if (!checkResult?.msg) {
                    throw new Error('无效的签到结果，签到失败');
                }

                console.log(checkResult.msg);
                message += `✅${checkResult.msg}\n\n`;
                return;
            } catch (e) {
                lastError = e;
                if (e.retryable === false || i === domains.length - 1) throw e;
                console.warn(`线路 ${i + 1} 请求失败：${getErrorMessage(e)}，尝试下一线路`);
            }
        }

        throw lastError || new Error('没有可用的 JM API 节点');
    } catch (e) {
        const error = getErrorMessage(e);
        console.error(`账号[${index}]签到时发生异常：${error}`);
        message += `❌签到失败：${error}\n\n`;
    }
}

/**
 * 维护单个 API 节点上的登录 Cookie，并处理 JM 的加密响应。
 */
class JmClient {
    /**
     * @param {string} domain API 节点
     */
    constructor(domain) {
        this.baseUrl = normalizeDomain(domain);
        this.cookies = new Map();
    }

    /**
     * @param {string} path API 路径
     * @param {string} [method] HTTP 方法
     * @param {object|null} [data] 表单数据
     * @returns {Promise<object>}
     */
    async request(path, method = 'GET', data = null) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const upperMethod = method.toUpperCase();
        const headers = getApiHeaders(timestamp);
        if (this.cookies.size) {
            headers.Cookie = [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
        }

        const options = {
            url: `${this.baseUrl}${path}`,
            method: upperMethod,
            headers,
            timeout: 20000,
            validateStatus: () => true,
        };
        if (upperMethod !== 'GET' && data !== null) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.data = new URLSearchParams(data).toString();
        }

        let response;
        try {
            response = await common.request(options);
        } catch (e) {
            e.retryable = true;
            throw e;
        }
        this.captureCookies(response.headers);

        if (response.status < 200 || response.status >= 300) {
            const error = new Error(formatApiError(response.data, response.status));
            error.response = response;
            error.retryable = !(path === '/login' && [400, 401, 403].includes(response.status));
            throw error;
        }

        const envelope = parseJson(response.data, 'JM API 响应不是有效 JSON');
        if (typeof envelope?.data !== 'string') {
            const error = new Error(envelope?.errorMsg || envelope?.msg || 'JM API 未返回加密数据');
            error.retryable = path !== '/login';
            throw error;
        }
        return parseJson(decryptData(envelope.data, `${timestamp}${JM_DATA_KEY}`), 'JM API 解密结果不是有效 JSON');
    }

    /**
     * @param {object} headers Axios 响应头
     */
    captureCookies(headers) {
        let setCookies = typeof headers?.getSetCookie === 'function'
            ? headers.getSetCookie()
            : headers?.['set-cookie'];
        if (!setCookies) return;
        if (!Array.isArray(setCookies)) setCookies = [setCookies];

        for (const cookie of setCookies) {
            const pair = String(cookie).split(';', 1)[0];
            const separator = pair.indexOf('=');
            if (separator <= 0) continue;
            this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
        }
    }
}

/**
 * 构建 JM API 鉴权请求头。
 *
 * @param {string} timestamp 秒级时间戳
 * @returns {object}
 */
function getApiHeaders(timestamp) {
    return {
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        Authorization: 'Bearer',
        Connection: 'keep-alive',
        Origin: 'https://localhost',
        Referer: 'https://localhost/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Storage-Access': 'active',
        token: crypto.createHash('md5').update(`${timestamp}${JM_AUTH_KEY}`).digest('hex'),
        tokenparam: `${timestamp},${JM_VERSION}`,
        'User-Agent': USER_AGENT,
        'X-Requested-With': JM_PACKAGE_NAME,
    };
}

/**
 * 解密 JM API 的 data 字段。
 *
 * @param {string} input Base64 密文
 * @param {string} secret 时间戳与数据密钥拼接值
 * @returns {string}
 */
function decryptData(input, secret) {
    const key = Buffer.from(crypto.createHash('md5').update(secret).digest('hex'), 'utf8');
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(input, 'base64')),
        decipher.final(),
    ]).toString('utf8');

    const objectStart = decrypted.indexOf('{');
    const arrayStart = decrypted.indexOf('[');
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    if (!starts.length) throw new Error('JM API 解密结果不包含 JSON');
    const start = Math.min(...starts);
    const objectEnd = decrypted.lastIndexOf('}');
    const arrayEnd = decrypted.lastIndexOf(']');
    const end = Math.max(objectEnd, arrayEnd);
    if (end < start) throw new Error('JM API 解密结果不完整');
    return decrypted.slice(start, end + 1);
}

/**
 * @param {string} account “账号#密码”配置
 * @returns {{username: string, password: string}}
 */
function parseAccount(account) {
    const separator = account.indexOf('#');
    if (separator <= 0 || separator === account.length - 1) {
        throw new Error('账号格式错误，应为：账号#密码');
    }
    return {
        username: account.slice(0, separator).trim(),
        password: account.slice(separator + 1),
    };
}

/**
 * @param {string|undefined} configuredDomains 自定义节点配置
 * @returns {string[]}
 */
function getApiDomains(configuredDomains) {
    const domains = configuredDomains
        ? configuredDomains.split(/[\n,&]/).map((item) => item.trim()).filter(Boolean)
        : FALLBACK_DOMAINS;
    return [...new Set(domains.map(normalizeDomain))];
}

/**
 * @param {string} domain 节点主机名或 URL
 * @returns {string}
 */
function normalizeDomain(domain) {
    const value = String(domain).trim();
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
        throw new Error(`无效的 JM API 节点：${domain}`);
    }
    return `${url.protocol}//${url.host}`;
}

/**
 * @param {*} value 待解析值
 * @param {string} fallbackMessage 默认错误信息
 * @returns {object}
 */
function parseJson(value, fallbackMessage) {
    if (value && typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (e) {
        throw new Error(fallbackMessage);
    }
}

/**
 * @param {*} data API 响应体
 * @param {number} status HTTP 状态码
 * @returns {string}
 */
function formatApiError(data, status) {
    const body = typeof data === 'string' ? parseJsonSafely(data) : data;
    return body?.errorMsg || body?.msg || body?.message || `HTTP ${status}`;
}

/**
 * @param {string} value JSON 文本
 * @returns {object|null}
 */
function parseJsonSafely(value) {
    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
}

/**
 * @param {*} error 异常
 * @returns {string}
 */
function getErrorMessage(error) {
    if (error?.response) {
        return formatApiError(error.response.data, error.response.status);
    }
    return error?.message || String(error);
}

module.exports = {
    JmClient,
    decryptData,
    getApiDomains,
    getApiHeaders,
    normalizeDomain,
    parseAccount,
};

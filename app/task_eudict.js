/**
 * 欧路词典
 *
 * App 抓包 Host：https://api.frdic.com 获取请求头 Authorization 的值
 * export EUDICT_TOKEN = 'xxxxxxxxxxxxxxx'
 * 多账号用 & 或换行
 *
 * const $ = new Env('欧路词典')
 * cron: 20 6 * * *
 */
const initScript = require('../utils/initScript')
const {$, notify, common, checkUpdate} = initScript('欧路词典');
const eudictToken = process.env.EUDICT_TOKEN ? process.env.EUDICT_TOKEN.split(/[\n&]/) : [];
// 信息推送
let message = '';
// 接口地址
const baseUrl = 'https://api.frdic.com'
// 请求头
const userAgent = '/eusoft_ting_en_android/9.0.2/390c943f15a24890_v//xiaomi/'
const headers = {
    'User-Agent': userAgent,
    'EudicUserAgent': userAgent,
    'EudicTimezone': '8',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json; charset=utf-8',
}

!(async () => {
    await checkUpdate($.name, eudictToken);
    for (let i = 0; i < eudictToken.length; i++) {
        const index = i + 1;
        headers.Authorization = eudictToken[i];
        console.log(`\n*****第[${index}]个${$.name}账号*****`);
        message += `📣====${$.name}账号[${index}]====📣\n`;
        await signIn();
        await $.wait(common.getRandomWait(2000, 2500));
    }
    if (message) {
        await notify.sendNotify(`「${$.name}」`, `${message}`);
    }
})().catch((e) => $.logErr(e)).finally(() => $.done());

/**
 * 签到
 *
 * @returns {Promise<void>}
 */
async function signIn() {
    let data;
    try {
        data = await common.sendRequest(`${baseUrl}/api/v3/user/checkin`, 'post', headers, '{timezone:8}');
    } catch (e) {
        // 今日已签到时接口返回 409，但响应体仍包含完整签到数据
        if (!e.response?.data?.checkin_date) {
            console.error(`签到时发生异常：${e}`);
            message += `签到失败：${e.message || e}\n\n`;
            return;
        }
        data = e.response.data;
    }
    const checkinDate = data.checkin_date ?? 0;
    const continuous = data.continuous ?? 0;
    const count = data.count ?? 0;
    console.log(`签到日期：${checkinDate}`);
    console.log(`连续签到：${continuous} 天`);
    console.log(`签到总数：${count} 天`);
    message += `签到日期：${checkinDate}\n`;
    message += `🏃‍连续签到：${continuous} 天\n`;
    message += `👴签到总数：${count} 天\n\n`;
}

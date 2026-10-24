# check-in-script

用于青龙面板的每日签到脚本集合。

## 青龙部署

安装依赖：

```text
axios
cheerio
got
tough-cookie
```

拉取脚本：

```bash
ql repo https://github.com/Henvy-Mango/check-in-script.git "task_" "" "utils"
```

## 脚本说明

### 欧路词典 · `app/task_eudict.js`

环境变量 `EUDICT_TOKEN`：App 抓包 Host `https://api.frdic.com`，取请求头 `Authorization` 的值。多账号用 `&` 或换行分隔。

### JMComic（禁漫天堂）· `app/task_jm.js`

环境变量 `JM_ACCOUNT`：账号和密码用 `#` 分隔，如 `账号#密码`。多账号用 `&` 或换行分隔。

可选 `JM_API_DOMAIN` 指定 API 节点，多个节点用英文逗号、`&` 或换行分隔；不填则使用脚本内置节点。

### 哔咔漫画 · `app/task_picacomic.js`

环境变量 `PICACOMIC_ACCOUNT`：用户名和密码用 `#` 分隔，如 `用户名#密码`。多账号用 `&` 或换行分隔。

### 夸克网盘 · `app/task_quark.js`

环境变量 `QUARK_COOKIE`：App 抓包 Host `https://drive-m.quark.cn`，打开抽奖页，复制 `/1/clouddrive/act/growth/reward` 请求的完整 Cookie，如：

```text
user=张三; url=https://drive-m.quark.cn/1/clouddrive/act/growth/reward?...&kps=xxx&sign=xxx&vcode=xxx;
```

也兼容旧格式 `user=张三; kps=xxx; sign=xxx; vcode=xxx;`。多账号用 `&&` 或换行分隔。

### 嘉立创 · `web/task_jlc.js`

环境变量 `JLC_TOKEN`：小程序「嘉立创下单助手」抓包 Host `https://m.jlc.com`，取请求头 `x-jlc-accesstoken` 和 `secretkey`，用 `#` 拼接，如 `x-jlc-accesstoken的值#secretkey的值`。多账号用 `&` 或换行分隔。

### 嘉立创硬件开源平台 · `web/task_jlc_yj.js`

环境变量 `JLC_COOKIE`：在 https://oshwhub.com/sign_in 抓包，复制完整 Cookie，如 `oshwhub_session=xxx; acw_tc=xxx; oshwhub_csrf=xxx`。多账号用 `&` 或换行分隔。

## 注意事项

- 脚本不支持 GitHub Actions，检测到 `GITHUB` 相关环境变量会直接退出，推荐使用青龙面板。
- 环境变量未配置时脚本会直接退出，请确认已在青龙面板中配置对应变量。
- 凭证会过期，签到失败时请重新抓包更新环境变量。

## 免责声明

本项目仅供学习与交流使用。请自行承担使用风险，遵守各平台的服务条款。维护者不对因使用本脚本造成的任何损失负责。

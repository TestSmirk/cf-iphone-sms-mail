# iPhone 短信转发到 139 邮箱

Cloudflare Workers 接收 iPhone 快捷指令 POST，然后通过 139 邮箱 SMTP 自己发给自己。

## 部署

```bash
npm install
npx wrangler secret put SMTP_USER
npx wrangler secret put SMTP_PASS
npx wrangler deploy
```

`SMTP_USER` 填 139 邮箱账号，例如：

```text
your-phone@139.com
```

`SMTP_PASS` 填 139 邮箱授权码：

```text
your-smtp-authorization-code
```

## iPhone 快捷指令

自动化条件：收到短信。

动作：获取 URL 内容。

- URL：Worker 部署后的地址
- 方法：`POST`
- 请求体：`JSON`

```json
{
  "to": "短信收件号码变量",
  "sender": "快捷指令里的发件人变量",
  "text": "快捷指令里的短信内容变量",
  "time": "当前日期"
}
```

也可以直接 `text/plain` POST，函数会把整个 body 当短信正文。

## 本地测试

```bash
npx wrangler dev
```

```bash
curl -X POST 'http://127.0.0.1:8787' \
  -H 'content-type: application/json' \
  -d '{"to":"+8613800000000","sender":"10086","text":"测试短信","time":"2026-06-18 12:00:00"}'
```

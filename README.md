# AI 英语阅读陪练语音评测 Demo

## 1. 项目说明

本仓库是一个用于验证“AI 英语绘本跟读评测”能力的 Web Demo。它聚焦标准朗读、浏览器录音、本地音频上传、语音评测、ASR 转写、错词建议、单词级评分、接口耗时统计和本地评测日志。

默认使用 Mock Provider，不需要任何真实三方 API Key。配置 `EVALUATION_PROVIDER=xfyun` 并提供讯飞密钥后，后端 `/api/evaluate` 会调用科大讯飞“语音评测 / ISE / 流式版”WebSocket 接口。

## 2. 功能清单

- React + Vite + TypeScript 前端页面。
- Node.js + Express + TypeScript REST API 后端。
- 左侧操作区：英文句子输入、内置句子选择、音频上传、标准朗读、录音、提交评测、清空结果。
- 右侧结果区：总分、准确度、流利度、完整度、清晰度、ASR、评测状态、Provider、音频转换格式、TTS/上传/评测/总耗时。
- 中文纠错建议和单词级评分展示，低分词标红，中等分词标黄。
- 调试信息折叠区：provider、convertedAudioPath/Format、讯飞 response code、sid、raw result 简略内容；不会展示 API Key 或 API Secret。
- Mock TTS、Mock 语音评测 Provider。
- 科大讯飞语音评测真实 Provider：WebSocket 鉴权、音频转换、分帧上传、XML 结果解析、错误兜底。
- 本地 JSON 文件保存最近评测日志，可通过接口查询。

## 3. 本地启动方式

### 后端

```bash
cd backend
npm install
npm run dev
```

后端默认地址：<http://localhost:3001>

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认地址：<http://localhost:5173>

Vite 已配置代理，前端访问 `/api` 和 `/static` 会转发到后端。

## 4. 环境变量说明

复制根目录 `.env.example` 到 `.env` 或 `backend/.env` 后按需修改。不要提交真实 `.env`。

```env
PORT=3001
NODE_ENV=development

TTS_PROVIDER=mock
EVALUATION_PROVIDER=mock

XFYUN_APP_ID=
XFYUN_API_KEY=
XFYUN_API_SECRET=
XFYUN_ISE_ENDPOINT=
XFYUN_ISE_LANGUAGE=en
XFYUN_ISE_CATEGORY=read_sentence
XFYUN_ISE_AUDIO_RATE=16000

TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_REGION=

YOUDAO_APP_KEY=
YOUDAO_APP_SECRET=

UPLOAD_DIR=./uploads
STATIC_DIR=./static
```

说明：

- `TTS_PROVIDER` 支持 `mock | xfyun | tencent | youdao`，当前可运行实现为 `mock`，Tencent/Youdao 为占位结构。
- `EVALUATION_PROVIDER=mock` 时始终使用 Mock 评测。
- `EVALUATION_PROVIDER=xfyun` 时使用真实讯飞 Provider；如果缺少 `XFYUN_APP_ID`、`XFYUN_API_KEY` 或 `XFYUN_API_SECRET`，启动不会崩溃，但调用 `/api/evaluate` 会返回 `status=failed` 和 `message=XFYUN credentials are not configured`。
- `XFYUN_ISE_ENDPOINT` 为空时，代码默认使用 `wss://ise-api.xfyun.cn/v2/open-ise`；如官方文档变更，请以讯飞控制台/官方文档为准。
- `UPLOAD_DIR` 保存上传/录音文件和 `uploads/converted` 转换后 PCM 文件。
- `STATIC_DIR` 保存 Mock TTS 静态音频文件。

## 5. Mock 模式如何启动

`.env` 保持：

```env
EVALUATION_PROVIDER=mock
TTS_PROVIDER=mock
```

然后分别启动后端和前端：

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Mock 模式用于无真实 API Key 的本地演示：

- `POST /api/tts` 返回本地静态 mp3 占位文件地址；前端同时调用浏览器 `speechSynthesis` 播放可听的英文标准读音作为兜底。
- `POST /api/evaluate` 根据目标句子词数、音频文件大小推算伪时长，并生成稳定但有轻微差异的评分。
- `Hello.` 的 Mock ASR 可能返回 `Hello.` 或 `The.`，用于演示错读效果。
- `wordScores` 始终返回数据，便于演示低分词标红和纠错建议。
- 评测日志写入 `backend/data/evaluation-logs.json`。

## 6. 接入科大讯飞语音评测

### 6.1 注册账号

1. 打开科大讯飞开放平台：<https://www.xfyun.cn/>。
2. 注册并登录账号。
3. 按平台要求完成实名认证。
4. 确认可用额度、套餐或试用次数满足测试需要。

### 6.2 创建应用

1. 进入讯飞开放平台控制台。
2. 创建 WebAPI 平台应用。
3. 记录该应用的 `AppID`、`APIKey`、`APISecret`。
4. 确认三项凭证来自同一个应用，且不要写入代码。

### 6.3 开通语音评测能力

1. 在应用能力或服务页面添加“语音评测 / ISE / 流式版”。
2. 确认服务状态为已开通。
3. 确认接口地址与官方文档一致，默认流式版地址为 `wss://ise-api.xfyun.cn/v2/open-ise`。

### 6.4 配置真实评测模式

在 `.env` 或 `backend/.env` 中配置：

```env
EVALUATION_PROVIDER=xfyun
XFYUN_APP_ID=your_app_id
XFYUN_API_KEY=your_api_key
XFYUN_API_SECRET=your_api_secret
XFYUN_ISE_ENDPOINT=
XFYUN_ISE_LANGUAGE=en
XFYUN_ISE_CATEGORY=read_sentence
XFYUN_ISE_AUDIO_RATE=16000
```

> `XFYUN_ISE_ENDPOINT` 可以留空，代码会使用默认值；如果讯飞官方文档或控制台给出新地址，请填写官方地址。

### 6.5 启动真实评测模式

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

打开 <http://localhost:5173>，录音或上传音频后点击“提交评测”。

### 6.6 支持的音频格式

前端允许上传：

- 浏览器录音：通常为 `webm/opus`。
- 本地文件：`wav`、`mp3`、`m4a`、`webm`。

后端会使用 ffmpeg 转换为讯飞评测更通用的格式：

- 16kHz
- 16bit
- mono
- PCM `s16le`

转换后的临时文件保存在 `uploads/converted`，后端会保留最近约 30 个文件用于调试，避免无限增长。

### 6.7 如何判断接口真实调用成功

- 前端总分卡片显示 `complete · xfyun`。
- 前端“调试信息”中 `provider` 为 `xfyun`，并出现 `xfyun sid`。
- `xfyun response code` 为 `0`。
- `raw result` 中可以看到讯飞返回的 XML/解析结果摘要。
- 访问 <http://localhost:3001/api/evaluation/logs>，日志中 `provider` 为 `xfyun`，并包含 `xfyunSid`、`xfyunCode`、`convertedAudioFormat`。

### 6.8 常见错误排查

- `XFYUN credentials are not configured`：缺少 `XFYUN_APP_ID`、`XFYUN_API_KEY` 或 `XFYUN_API_SECRET`。补全 `.env` 后重启后端。
- `401 / HMAC signature`：检查 APIKey/APISecret 是否正确、是否属于同一个应用；检查服务器时间是否准确；检查 endpoint host/path 是否与签名一致。
- `appid 无权限` 或服务未开通：进入讯飞控制台确认应用已经开通 ISE 流式版。
- 音频转换失败：确认 `npm install` 成功安装 `ffmpeg-static`；检查源音频是否损坏。
- 音频采样率不正确：保持 `XFYUN_ISE_AUDIO_RATE=16000`，并确认后端调试信息中转换后格式为 `pcm_s16le;rate=16000;channels=1`。
- WebSocket timeout：检查网络、账号额度、音频时长；必要时设置 `XFYUN_ISE_TIMEOUT_MS=30000`。
- 返回结果为空：检查试题文本、语言 `XFYUN_ISE_LANGUAGE` 和题型 `XFYUN_ISE_CATEGORY` 是否匹配。
- 没有单词级评分：部分题型或参数可能不返回单词级明细；系统会继续展示总分并给出提示。

### 6.9 如何回退 Mock 模式

把 `.env` 改回：

```env
EVALUATION_PROVIDER=mock
```

重启后端即可。Mock Provider 不依赖任何讯飞配置。


## 7. 页面配置讯飞 API 参数

页面左侧“API 配置”面板用于 Demo 测试人员在不修改 `.env`、不重启后端的情况下，临时切换 `mock` / `xfyun` 并填写科大讯飞语音评测参数。该能力只使用后端内存保存配置，服务重启后会丢失，适合联调和验收，不建议直接用于生产环境。

### 7.1 如何填写 AppID / APIKey / APISecret

1. 在“Evaluation Provider”下拉框选择 `xfyun`。
2. 填写同一个讯飞开放平台应用下的 `XFYUN AppID`、`XFYUN API Key`、`XFYUN API Secret`。
3. `Language` 默认 `en_us`。
4. `Category` 默认 `read_sentence`，也可选择 `read_word` 或 `read_chapter`。
5. `Endpoint` 可以留空；留空时后端使用默认讯飞 ISE endpoint 或 `.env` 中的 `XFYUN_ISE_ENDPOINT`。
6. 点击“保存配置”，后端返回 `configId` 后，后续“提交评测”会自动在 multipart/form-data 中携带该 `configId`。
7. 点击“测试配置”可检查必填参数和讯飞鉴权 URL 是否能生成；该测试不要求发起一次真实语音评测。

### 7.2 如何切换 mock / xfyun

- 切换到真实讯飞：选择 `xfyun`，填写三项密钥，保存配置，看到页面显示“配置已保存”和 `configId` 后再提交评测。
- 切换到 Mock：点击“使用 Mock 模式”，前端会调用运行时配置保存接口并保存 `provider=mock`，后续提交评测会走 Mock Provider。
- 清空页面配置：点击“清空配置”，前端会删除当前 `configId` 对应的后端内存配置并清空页面状态；之后评测会回到 `.env` 配置或默认 Mock。

### 7.3 配置优先级

运行时页面配置和 `.env` 配置同时存在时，优先级如下：

```text
configId 页面配置 > .env 配置 > mock 默认模式
```

也就是说：

- `/api/evaluate` 收到有效 `configId` 时，使用该页面配置中的 `provider` 和讯飞参数。
- 未传 `configId` 时，继续使用 `.env` 中的 `EVALUATION_PROVIDER` 和 `XFYUN_*` 配置。
- `.env` 未配置或配置为 `mock` 时，系统仍可使用 Mock Provider 完整运行。

### 7.4 Secret 安全说明

- 前端 `XFYUN API Secret` 输入框默认是 `password` 类型，可手动显示 / 隐藏。
- 保存成功后，前端会清空完整 Secret 输入值，不会在普通结果区或调试结果区展示完整 Secret。
- 页面不会把 `API Secret` 写入 `localStorage`；如后续需要持久化页面状态，只允许持久化 `configId`，不能持久化 Secret。
- 后端 `GET /api/runtime-config/evaluation/:configId` 只返回脱敏配置：`apiSecret` 仅显示为 `configured` 或 `missing`，不会返回完整 Secret。
- `.env.example` 只能保留空占位符，不能提交真实密钥。

### 7.5 Demo 模式与生产模式差异

当前页面配置是 Demo 便利功能：配置保存在单进程内存 `Map` 中，服务重启会丢失，也没有多用户隔离、审计、权限控制或密钥托管能力。生产环境建议使用后端安全配置中心、KMS/Secret Manager、租户级权限校验、审计日志、密钥轮换和最小权限访问，不建议让浏览器直接提交长期有效的三方 Secret。

## 8. 后端接口

### `GET /api/health`

返回当前运行模式和 Provider 名称。

### Runtime Config 接口

- `POST /api/runtime-config/evaluation`：保存页面运行时评测配置，返回 `configId`。`provider=mock` 不需要提交讯飞配置；`provider=xfyun` 需要提交 `appId`、`apiKey`、`apiSecret`，也可提交 `endpoint`、`language`、`category`。
- `GET /api/runtime-config/evaluation/:configId`：返回脱敏后的运行时配置，绝不返回完整 `apiSecret`。
- `POST /api/runtime-config/evaluation/test`：可传 `{ "configId": "cfg_xxx" }` 或直接传配置，检查 Mock 或讯飞配置是否合法，并验证讯飞鉴权 URL 可以生成。
- `DELETE /api/runtime-config/evaluation/:configId`：删除后端内存中的页面配置。

### `POST /api/evaluate`

请求仍然是 `multipart/form-data`：

- `text`：待评测英文文本。
- `audio`：录音或上传音频文件。
- `source`：`browser` 或 `upload`。
- `configId`：可选；传入页面保存配置返回的 `configId` 后，本次评测优先使用页面配置。

返回结构保持前端兼容，并扩展调试字段：

- `provider`
- `originalAudioMimeType`
- `convertedAudioFormat`
- `convertedAudioPath`
- `xfyunSid`
- `xfyunCode`
- `raw`

失败时不会导致服务崩溃，会返回：

```json
{
  "status": "failed",
  "provider": "xfyun",
  "message": "Readable error message",
  "errorCode": "XFYUN_EVALUATION_FAILED"
}
```

## 9. 测试流程

1. 启动后端和前端。
2. 打开 <http://localhost:5173>。
3. 选择内置句子或手动输入英文句子。
4. 点击“播放标准读音”，确认能听到浏览器朗读或看到标准读音播放器有音频源。
5. 点击“开始录音”，允许浏览器麦克风权限后朗读句子。
6. 点击“停止录音”，确认“待评测音频播放器”可以回放。
7. 点击“提交评测”，确认右侧出现评分、ASR、建议、单词级结果、耗时和调试信息。
8. 改用本地 wav/mp3/webm/m4a 音频上传，再提交一次评测。
9. 访问 <http://localhost:3001/api/evaluation/logs> 查看最近 20 条评测日志。
10. 真实讯飞验收可参考 `docs/xfyun-test-guide.md`。

## 10. Demo 验收标准

- 不配置任何真实 API Key，也能跑通完整 Mock Demo。
- `EVALUATION_PROVIDER=xfyun` 且配置真实密钥后，可以调用真实讯飞语音评测。
- 页面可以浏览器录音、上传 wav/mp3/webm/m4a 音频，并提交评测。
- 可以展示总分、准确度、流利度、完整度、清晰度、ASR 转写、中文纠错建议和单词级评分。
- 可以展示 provider、音频转换格式、评测耗时、总耗时和 raw 调试信息。
- 如果讯飞不返回单词级结果，系统不报错，并给出提示。
- API Key / API Secret 不能写死在代码里，代码和 `.env.example` 不包含真实密钥；页面运行时配置只用于 Demo，且不会把完整 Secret 返回前端或写入 localStorage。
- Mock Provider 保留可用，不破坏现有前端页面。

## 11. 后续迁移到微信小程序的注意事项

- 小程序端不能直接复用浏览器 `MediaRecorder` 和 `speechSynthesis`，需要改用小程序录音 API 与音频播放组件。
- 小程序上传音频时要确认格式、采样率和第三方评测 API 要求一致。
- 后端 Provider 抽象可复用，小程序只需调用同样的 `/api/tts` 与 `/api/evaluate`。
- 需要补充用户身份、任务 ID、绘本 ID 等业务字段时，再引入数据库，不建议在 Demo 阶段提前复杂化。
- 小程序正式上线前要处理麦克风授权提示、儿童隐私合规、日志脱敏、音频文件生命周期和 CDN/对象存储。
- 正式业务中建议将 Mock 模式仅用于测试环境，生产环境明确配置真实 Provider 和错误告警。

## 中文语音反馈功能

评测完成后，后端会基于总分、准确度、流利度、完整度、清晰度以及单词级错词结果，用规则模板生成一段适合儿童理解的中文反馈。返回的 `/api/evaluate` 响应会新增 `feedback` 字段，并在 `timing.feedbackTtsMs` 中记录本次中文反馈 TTS 耗时。

### Mock TTS 如何使用

默认配置为 Mock 模式，不需要任何真实第三方密钥：

```env
ENABLE_VOICE_FEEDBACK=true
FEEDBACK_TTS_PROVIDER=mock
FEEDBACK_LANGUAGE=zh
FEEDBACK_VOICE=xiaoyan
FEEDBACK_SPEED=normal
```

Mock Provider 会优先返回 `/static/mock/feedback-zh.mp3` 作为占位音频；如果当前环境无法创建占位音频，也会返回文字反馈并保持 `audioUrl` 为空，不会导致 Demo 报错。

### 讯飞 TTS 如何配置

如需使用科大讯飞在线语音合成，将反馈 TTS Provider 切换为 `xfyun` 并配置密钥：

```env
ENABLE_VOICE_FEEDBACK=true
FEEDBACK_TTS_PROVIDER=xfyun
FEEDBACK_LANGUAGE=zh
FEEDBACK_VOICE=xiaoyan
FEEDBACK_SPEED=normal

XFYUN_TTS_APP_ID=your_app_id
XFYUN_TTS_API_KEY=your_api_key
XFYUN_TTS_API_SECRET=your_api_secret
XFYUN_TTS_ENDPOINT=wss://tts-api.xfyun.cn/v2/tts
```

如果 `XFYUN_TTS_APP_ID`、`XFYUN_TTS_API_KEY`、`XFYUN_TTS_API_SECRET` 留空，后端会尝试复用已有的 `XFYUN_APP_ID`、`XFYUN_API_KEY`、`XFYUN_API_SECRET`。生成的中文语音会保存到 `backend/static/feedback/`，前端通过类似 `/static/feedback/feedback_xxx.mp3` 的地址播放。

### 如何开启 / 关闭语音反馈

- 开启：`ENABLE_VOICE_FEEDBACK=true`
- 关闭：`ENABLE_VOICE_FEEDBACK=false`

关闭后，系统仍然会返回中文文字反馈，但不会调用 TTS，`feedback.audioUrl` 会为空。

### TTS 失败为什么不影响评测结果

中文语音反馈属于评测后的增强能力。后端会先完成语音评测和中文反馈文案生成，再尝试调用 TTS。若 TTS 调用失败，`/api/evaluate` 仍返回原有评分、ASR、单词级结果和文字反馈，只在 `feedback.errorMessage` 中展示语音生成失败原因。

### 浏览器为什么需要用户点击播放

现代浏览器通常会限制自动播放音频。前端不会强制自动播放中文反馈，而是在评测结果区展示“播放语音反馈”按钮和 `<audio controls>` 播放器，由用户点击后播放。

### 页面运行时配置

页面的 API 配置面板支持配置中文语音反馈：

- `ENABLE_VOICE_FEEDBACK`
- `FEEDBACK_TTS_PROVIDER`：`mock` / `xfyun`
- `XFYUN_TTS_APP_ID`
- `XFYUN_TTS_API_KEY`
- `XFYUN_TTS_API_SECRET`
- `FEEDBACK_VOICE`
- `FEEDBACK_SPEED`：`normal` / `slow`

TTS API Secret 仅随保存/测试请求发送，保存后前端会清空输入框，不写入 localStorage，也不会在评测结果区完整回显。

### 安全注意事项

- 不要在 README、日志或前端展示区填写真实 API Key / API Secret。
- 后端日志只记录反馈文案、Provider、音频地址、耗时和错误信息，不记录任何 TTS 密钥。
- 生产环境建议通过服务端环境变量注入讯飞 TTS 配置。
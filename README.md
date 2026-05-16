# AI 英语阅读陪练语音评测 Demo

## 1. 项目说明

本仓库是一个用于验证“AI 英语绘本跟读评测”能力的 Web Demo。它不是完整业务系统，只聚焦：标准朗读、浏览器录音、本地音频上传、语音评测、ASR 转写、错词建议、单词级评分、接口耗时统计和本地评测日志。

默认不需要任何真实三方 API Key。没有配置真实凭证时，后端会自动使用 Mock Provider，方便本地演示和需求评审。

## 2. 功能清单

- React + Vite + TypeScript 前端页面。
- Node.js + Express + TypeScript REST API 后端。
- 左侧操作区：英文句子输入、内置句子选择、音频上传、标准朗读、录音、提交评测、清空结果。
- 右侧结果区：总分、准确度、流利度、完整度、清晰度、ASR、评测状态、TTS/上传/评测/总耗时。
- 中文纠错建议和单词级评分展示，低分词标红，中等分词标黄。
- Mock TTS 与 Mock 语音评测 Provider。
- Xfyun 语音评测、Tencent TTS、Youdao TTS 的占位接入结构。
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

复制根目录 `.env.example` 到 `.env` 或 `backend/.env` 后按需修改。

```env
PORT=3001
NODE_ENV=development

TTS_PROVIDER=mock
EVALUATION_PROVIDER=mock

XFYUN_APP_ID=
XFYUN_API_KEY=
XFYUN_API_SECRET=

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
- `EVALUATION_PROVIDER` 支持 `mock | xfyun | tencent | youdao`，当前可运行实现为 `mock`，Xfyun 为占位结构。
- 没有填写对应 Provider 凭证时，后端会自动回退到 Mock，避免 Demo 不可用。
- `UPLOAD_DIR` 保存上传/录音文件。
- `STATIC_DIR` 保存 Mock TTS 静态音频文件。

## 5. Mock 模式说明

Mock 模式用于无真实 API Key 的本地演示：

- `POST /api/tts` 返回一个本地静态 mp3 占位文件地址；前端同时调用浏览器 `speechSynthesis` 播放可听的英文标准读音作为兜底。
- `POST /api/evaluate` 根据目标句子词数、音频文件大小推算伪时长，并生成稳定但有轻微差异的评分。
- `Hello.` 的 Mock ASR 可能返回 `Hello.` 或 `The.`，用于演示错读效果。
- `wordScores` 始终返回数据，便于演示低分词标红和纠错建议。
- 评测日志写入 `backend/data/evaluation-logs.json`。

## 6. 如何替换真实语音评测 API

后端语音评测抽象位于 `backend/src/types.ts` 的 `SpeechEvaluationProvider`。替换真实服务时建议：

1. 在 `backend/src/providers/` 新增或完善具体 Provider，例如完善 `XfyunSpeechEvaluationProvider`。
2. 从 `.env` 读取 App ID、API Key、Secret，禁止硬编码密钥。
3. 在 Provider 内将上传音频转换为第三方 API 需要的格式。
4. 将第三方响应标准化为统一结构：`scores`、`asrText`、`wordScores`、`suggestions`、`timing`。
5. 在 `backend/src/providers/index.ts` 中按凭证是否完整选择真实 Provider，否则继续回退 Mock。
6. 用 `GET /api/health` 检查当前 Provider 是否切换成功。

## 7. 如何替换真实 TTS API

后端 TTS 抽象位于 `backend/src/types.ts` 的 `TtsProvider`。替换真实 TTS 时建议：

1. 完善 `TencentTtsProvider` 或 `YoudaoTtsProvider`，也可新增其他 Provider。
2. 使用 `.env` 管理所有密钥和区域配置。
3. 将第三方合成音频保存到 `STATIC_DIR/tts`，返回 `/static/tts/xxx.mp3`。
4. 返回统一结构：`audioUrl`、`durationMs`、`provider`、`raw`。
5. 如果第三方调用失败，可保留 Mock 兜底逻辑，保证演示可继续。

## 8. 测试流程

1. 启动后端和前端。
2. 打开 <http://localhost:5173>。
3. 选择内置句子或手动输入英文句子。
4. 点击“播放标准读音”，确认能听到浏览器朗读或看到标准读音播放器有音频源。
5. 点击“开始录音”，允许浏览器麦克风权限后朗读句子。
6. 点击“停止录音”，确认“待评测音频播放器”可以回放。
7. 点击“提交评测”，确认右侧出现评分、ASR、建议、单词级结果和耗时。
8. 改用本地 wav/mp3/webm/m4a 音频上传，再提交一次评测。
9. 访问 <http://localhost:3001/api/evaluation/logs> 查看最近 20 条评测日志。

## 9. Demo 验收标准

- 不配置任何真实 API Key，也能跑通完整 Demo。
- 页面可以输入英文句子，并可选择内置 5 条句子。
- 页面可以播放标准读音。
- 页面可以浏览器录音。
- 页面可以上传 wav、mp3、webm、m4a 音频。
- 点击提交评测后，可以返回评分结果。
- 可以展示总分、准确度、流利度、完整度、清晰度。
- 可以展示 ASR 转写。
- 可以展示中文纠错建议。
- 可以展示单词级评分，并对低分词标红、中分词标黄。
- 可以展示 TTS、上传、评测和总耗时。
- 评测日志可以在后端保存并通过接口查看。
- 代码中不得硬编码任何 API Key。
- README 可让非项目开发人员按步骤启动。

## 10. 后续迁移到微信小程序的注意事项

- 小程序端不能直接复用浏览器 `MediaRecorder` 和 `speechSynthesis`，需要改用小程序录音 API 与音频播放组件。
- 小程序上传音频时要确认格式、采样率和第三方评测 API 要求一致。
- 后端 Provider 抽象可复用，小程序只需调用同样的 `/api/tts` 与 `/api/evaluate`。
- 需要补充用户身份、任务 ID、绘本 ID 等业务字段时，再引入数据库，不建议在 Demo 阶段提前复杂化。
- 小程序正式上线前要处理麦克风授权提示、儿童隐私合规、日志脱敏、音频文件生命周期和 CDN/对象存储。
- 正式业务中建议将 Mock 模式仅用于测试环境，生产环境明确配置真实 Provider 和错误告警。

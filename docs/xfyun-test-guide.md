# 科大讯飞语音评测测试指南

## 一、测试前准备

- 确认讯飞开放平台账号已完成实名认证。
- 确认应用已经开通“语音评测 / ISE / 流式版”服务。
- 确认 AppID、APIKey、APISecret 正确，且只写入 `.env` 或 `backend/.env`。
- 确认账户有可用额度，控制台没有欠费、停用或限流。
- 确认本机可以访问 `wss://ise-api.xfyun.cn/v2/open-ise`。
- 确认后端能安装并运行 ffmpeg（项目使用 `ffmpeg-static` + `fluent-ffmpeg`）。

## 二、测试句子

建议使用以下短句逐步验证：

- Hello.
- I see a little cat.
- The rabbit is running fast.
- Can you see the yellow bird?
- I like reading English books.

## 三、测试音频

至少覆盖以下来源：

- 浏览器录音：验证 webm/opus 可以上传并由后端转换为 16kHz、16bit、mono PCM。
- 本地 wav 上传：验证常见 wav 文件可以转换并评测。
- 本地 mp3 上传：验证 mp3 解码转换链路可用。
- 儿童真实录音上传：验证真实业务音频下评分、完整度和建议是否符合预期。

## 四、验收指标

- 能成功返回真实评测结果，前端调试信息显示 `provider=xfyun`。
- 能显示总分、准确度、流利度、完整度；如讯飞返回清晰度或发音相关分，能映射到清晰度。
- 如果接口支持并返回单词级结果，前端能显示单词级评分，并对低分词标红。
- 如果没有单词级评分，系统不报错，建议中提示当前接口结果未返回单词级明细。
- 明显错读、漏读、停顿过多时能生成中文纠错建议。
- 单次评测总耗时建议控制在 2–6 秒内；较长音频或网络波动可能更久。
- 接口失败时返回明确错误，不导致后端服务崩溃。
- 评测日志包含 provider、音频格式、讯飞 sid/code、错误信息和耗时。

## 五、常见问题

### 401 / 鉴权失败

检查 `XFYUN_API_KEY`、`XFYUN_API_SECRET` 是否来自同一个已开通 ISE 流式版的应用；检查服务器时间是否准确。讯飞签名使用 `host date request-line` 和 HMAC-SHA256，时间偏差过大也会失败。

### appid 无权限 / 服务未开通

进入讯飞控制台确认应用已开通“语音评测 / ISE / 流式版”，并确认当前 AppID 与 APIKey/APISecret 匹配。

### 音频格式不支持

后端会尝试把 webm、wav、mp3、m4a 转为 `pcm_s16le;rate=16000;channels=1`。如果仍失败，检查 ffmpeg 依赖是否安装成功，以及源音频是否损坏。

### 音频采样率不正确

默认 `XFYUN_ISE_AUDIO_RATE=16000`。如调整该值，需要确认讯飞接口 `auf` 与实际转换输出一致。

### WebSocket timeout

默认超时约 25 秒。检查网络、账号额度、音频时长，必要时通过 `XFYUN_ISE_TIMEOUT_MS` 临时增大超时。

### 返回结果为空

检查试题文本格式和语言/题型是否匹配。英文句子默认使用 `XFYUN_ISE_LANGUAGE=en`、`XFYUN_ISE_CATEGORY=read_sentence`。

### 没有单词级评分

确认当前题型和讯飞返回参数是否支持单词级明细；后端不会报错，会返回空数组并生成提示建议。

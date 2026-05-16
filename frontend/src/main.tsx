import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Status = "待录音" | "录音中" | "待提交" | "评测中" | "评测完成" | "评测失败";
type AudioSource = "浏览器录音" | "本地上传" | "未选择";
type EvaluationProvider = "mock" | "xfyun";
type XfyunCategory = "read_word" | "read_sentence" | "read_chapter";
type FeedbackTtsProvider = "mock" | "xfyun";
type FeedbackSpeed = "normal" | "slow";

interface DemoSentence { id: string; text: string; level: string; }
interface ScoreSet { total: number; accuracy: number; fluency: number; integrity: number; clarity: number; }
interface WordScore { word: string; score: number; status: "ok" | "warning" | "bad"; suggestion?: string; }
interface RuntimeConfigForm { provider: EvaluationProvider; appId: string; apiKey: string; apiSecret: string; endpoint: string; language: string; category: XfyunCategory; enableVoiceFeedback: boolean; feedbackProvider: FeedbackTtsProvider; feedbackAppId: string; feedbackApiKey: string; feedbackApiSecret: string; feedbackEndpoint: string; feedbackVoice: string; feedbackSpeed: FeedbackSpeed; }
interface EvaluationResult {
  status: "complete" | "failed";
  provider: string;
  scores: ScoreSet;
  asrText: string;
  wordScores: WordScore[];
  suggestions: string[];
  feedback?: { text: string; language: "zh"; audioUrl: string; provider: FeedbackTtsProvider; durationMs: number; ttsMs: number; errorMessage: string; };
  timing: { uploadMs: number; evaluationMs: number; feedbackTtsMs?: number; totalMs: number; };
  message?: string;
  errorCode?: string;
  originalAudioMimeType?: string;
  convertedAudioFormat?: string;
  convertedAudioPath?: string;
  xfyunSid?: string;
  xfyunCode?: number;
  raw?: unknown;
}

const defaultText = `Hello.\nI see a little cat.\nThe rabbit is running fast.\nCan you see the yellow bird?`;
const defaultRuntimeConfigForm: RuntimeConfigForm = {
  provider: "mock",
  appId: "",
  apiKey: "",
  apiSecret: "",
  endpoint: "",
  language: "en_us",
  category: "read_sentence",
  enableVoiceFeedback: true,
  feedbackProvider: "mock",
  feedbackAppId: "",
  feedbackApiKey: "",
  feedbackApiSecret: "",
  feedbackEndpoint: "",
  feedbackVoice: "xiaoyan",
  feedbackSpeed: "normal"
};

function scoreClass(score: number) {
  if (score < 70) return "bad";
  if (score <= 85) return "warning";
  return "ok";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <div className="score-row__meta"><span>{label}</span><strong>{value.toFixed(1)}</strong></div>
      <div className="bar"><span className={scoreClass(value)} style={{ width: `${Math.min(value, 100)}%` }} /></div>
    </div>
  );
}

function App() {
  const [sentences, setSentences] = useState<DemoSentence[]>([]);
  const [text, setText] = useState(defaultText);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<Status>("待录音");
  const [audioSource, setAudioSource] = useState<AudioSource>("未选择");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [standardAudioUrl, setStandardAudioUrl] = useState("");
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [message, setMessage] = useState("");
  const [runtimeConfigForm, setRuntimeConfigForm] = useState<RuntimeConfigForm>(defaultRuntimeConfigForm);
  const [currentConfigId, setCurrentConfigId] = useState("");
  const [savedProvider, setSavedProvider] = useState<EvaluationProvider | "env/default">("env/default");
  const [configSaved, setConfigSaved] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showFeedbackSecret, setShowFeedbackSecret] = useState(false);
  const feedbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const [configMessage, setConfigMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const activeText = useMemo(() => text.trim(), [text]);

  useEffect(() => {
    fetch("/api/demo/sentences")
      .then((res) => res.json())
      .then((data: DemoSentence[]) => {
        setSentences(data);
        if (data[0]) setSelectedId(data[0].id);
      })
      .catch(() => setMessage("无法加载内置句子，请确认后端已启动。"));
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function chooseSentence(id: string) {
    setSelectedId(id);
    const sentence = sentences.find((item) => item.id === id);
    if (sentence) setText(sentence.text);
  }

  async function playStandardVoice() {
    if (!activeText) return setMessage("请先输入英文测试句子。");
    setMessage("正在生成标准读音...");
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeText, speed: "normal", voice: "female" })
      });
      if (!response.ok) throw new Error("TTS 接口调用失败");
      const data = await response.json() as { audioUrl: string; durationMs: number; provider: string };
      setTtsMs(Math.round(performance.now() - startedAt));
      setStandardAudioUrl(data.audioUrl);
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(activeText);
        utterance.lang = "en-US";
        utterance.rate = 0.9;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
      setMessage(`标准读音已准备（provider: ${data.provider}）。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标准读音生成失败");
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return setMessage("当前浏览器不支持录音，请改用本地音频上传。");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setAudioSource("浏览器录音");
      setStatus("待提交");
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.start();
    setRecordingSeconds(0);
    setStatus("录音中");
    setMessage("录音中，请朗读左侧英文句子。");
    timerRef.current = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    setMessage("录音已停止，可以提交评测。");
  }

  function onUpload(file: File | undefined) {
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    setAudioSource("本地上传");
    setRecordingSeconds(0);
    setStatus("待提交");
    setMessage(`已选择音频：${file.name}`);
  }


  function runtimeConfigPayload(form: RuntimeConfigForm) {
    const feedback = {
      enabled: form.enableVoiceFeedback,
      provider: form.feedbackProvider,
      voice: form.feedbackVoice.trim() || "xiaoyan",
      speed: form.feedbackSpeed,
      xfyun: form.feedbackProvider === "xfyun" ? {
        appId: form.feedbackAppId.trim(),
        apiKey: form.feedbackApiKey.trim(),
        apiSecret: form.feedbackApiSecret,
        endpoint: form.feedbackEndpoint.trim()
      } : undefined
    };
    if (form.provider === "mock") return { provider: "mock", feedback };
    return {
      provider: "xfyun",
      xfyun: {
        appId: form.appId.trim(),
        apiKey: form.apiKey.trim(),
        apiSecret: form.apiSecret,
        endpoint: form.endpoint.trim(),
        language: form.language.trim() || "en_us",
        category: form.category
      },
      feedback
    };
  }

  async function saveRuntimeConfig(override?: RuntimeConfigForm) {
    const form = override || runtimeConfigForm;
    setConfigBusy(true);
    setConfigError("");
    setConfigMessage("正在保存配置...");
    try {
      const response = await fetch("/api/runtime-config/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runtimeConfigPayload(form))
      });
      const data = await response.json() as { ok: boolean; configId?: string; provider?: EvaluationProvider; message?: string };
      if (!response.ok || !data.ok || !data.configId || !data.provider) throw new Error(data.message || "保存配置失败");
      setCurrentConfigId(data.configId);
      setSavedProvider(data.provider);
      setConfigSaved(true);
      setConfigMessage(`配置已保存：${data.provider}（configId: ${data.configId}）`);
      setRuntimeConfigForm((value) => ({ ...value, apiSecret: "", feedbackApiSecret: "" }));
    } catch (error) {
      setConfigSaved(false);
      setConfigError(error instanceof Error ? error.message : "保存配置失败");
      setConfigMessage("");
    } finally {
      setConfigBusy(false);
    }
  }

  async function testRuntimeConfig() {
    setConfigBusy(true);
    setConfigError("");
    setConfigMessage("正在测试配置...");
    try {
      const body = currentConfigId ? { configId: currentConfigId } : runtimeConfigPayload(runtimeConfigForm);
      const response = await fetch("/api/runtime-config/evaluation/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json() as { ok: boolean; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || "测试配置失败");
      setConfigMessage(data.message || "配置测试通过");
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "测试配置失败");
      setConfigMessage("");
    } finally {
      setConfigBusy(false);
    }
  }

  async function clearRuntimeConfig() {
    const deletingConfigId = currentConfigId;
    setConfigBusy(true);
    setConfigError("");
    try {
      if (deletingConfigId) await fetch(`/api/runtime-config/evaluation/${encodeURIComponent(deletingConfigId)}`, { method: "DELETE" });
      setCurrentConfigId("");
      setConfigSaved(false);
      setSavedProvider("env/default");
      setRuntimeConfigForm(defaultRuntimeConfigForm);
      setConfigMessage("页面配置已清空，后续评测将回到 .env 配置或默认 Mock。密钥未写入 localStorage。");
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : "清空配置失败");
    } finally {
      setConfigBusy(false);
    }
  }

  function useMockMode() {
    const mockForm: RuntimeConfigForm = { ...defaultRuntimeConfigForm, provider: "mock" };
    setRuntimeConfigForm(mockForm);
    void saveRuntimeConfig(mockForm);
  }

  async function submitEvaluation() {
    if (!activeText) return setMessage("请先输入英文测试句子。");
    if (!audioBlob) return setMessage("请先录音或上传音频。");
    setStatus("评测中");
    setMessage("正在提交语音评测...");
    const form = new FormData();
    form.append("text", activeText);
    form.append("source", audioSource === "本地上传" ? "upload" : "browser");
    form.append("audio", audioBlob, audioSource === "本地上传" && audioBlob instanceof File ? audioBlob.name : "browser-recording.webm");
    if (currentConfigId) form.append("configId", currentConfigId);
    try {
      const response = await fetch("/api/evaluate", { method: "POST", body: form });
      const data = await response.json() as EvaluationResult;
      if (!response.ok) throw new Error(data.message || "评测失败");
      setResult(data);
      if (data.status === "failed") {
        setStatus("评测失败");
        setMessage(data.message || data.suggestions?.[0] || "评测失败");
      } else {
        setStatus("评测完成");
        setMessage("评测完成，可查看右侧结果。");
      }
    } catch (error) {
      setStatus("评测失败");
      setMessage(error instanceof Error ? error.message : "评测失败");
    }
  }

  function clearAll() {
    setResult(null);
    setMessage("");
    setStatus("待录音");
    setAudioSource("未选择");
    setRecordingSeconds(0);
    setAudioBlob(null);
    setAudioUrl("");
    setTtsMs(null);
  }

  function playFeedbackAudio() {
    if (!result?.feedback?.audioUrl) return;
    void feedbackAudioRef.current?.play();
  }

  return (
    <main className="page">
      <header className="hero">
        <div><p className="eyebrow">Speech Evaluation Demo</p><h1>AI 英语跟读评测 Demo</h1><p>标准朗读、浏览器录音、本地上传、AI 评分、ASR 转写与错词建议一页完成。</p></div>
        <span className="badge">Mock / 讯飞双模式</span>
      </header>

      <section className="layout">
        <aside className="card controls">
          <h2>操作区</h2>
          <label>英文测试句子</label>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} />
          <label>句子选择</label>
          <select value={selectedId} onChange={(event) => chooseSentence(event.target.value)}>
            {sentences.map((item) => <option key={item.id} value={item.id}>{item.text}（{item.level}）</option>)}
          </select>
          <label>本地音频文件上传</label>
          <input type="file" accept=".wav,.mp3,.webm,.m4a,audio/*" onChange={(event) => onUpload(event.target.files?.[0])} />

          <div className="button-grid">
            <button onClick={playStandardVoice}>播放标准读音</button>
            <button onClick={startRecording} disabled={status === "录音中"}>开始录音</button>
            <button onClick={stopRecording} disabled={status !== "录音中"}>停止录音</button>
            <button className="primary" onClick={submitEvaluation} disabled={status === "评测中"}>提交评测</button>
            <button className="ghost" onClick={clearAll}>清空结果</button>
          </div>



          <section className="api-config">
            <h3>API 配置</h3>
            <label>Evaluation Provider</label>
            <select value={runtimeConfigForm.provider} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, provider: event.target.value as EvaluationProvider }))}>
              <option value="mock">mock</option>
              <option value="xfyun">xfyun</option>
            </select>

            {runtimeConfigForm.provider === "xfyun" && (
              <>
                <label>XFYUN AppID</label>
                <input type="text" value={runtimeConfigForm.appId} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, appId: event.target.value }))} placeholder="请输入 AppID" />
                <label>XFYUN API Key</label>
                <input type="text" value={runtimeConfigForm.apiKey} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, apiKey: event.target.value }))} placeholder="请输入 API Key" />
                <label>XFYUN API Secret</label>
                <div className="secret-row">
                  <input type={showSecret ? "text" : "password"} value={runtimeConfigForm.apiSecret} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, apiSecret: event.target.value }))} placeholder={configSaved ? "已保存后清空；如需重存请重新输入" : "请输入 API Secret"} />
                  <button type="button" className="ghost" onClick={() => setShowSecret((value) => !value)}>{showSecret ? "隐藏" : "显示"}</button>
                </div>
                <label>Language</label>
                <input type="text" value={runtimeConfigForm.language} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, language: event.target.value }))} placeholder="en_us" />
                <label>Category</label>
                <select value={runtimeConfigForm.category} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, category: event.target.value as XfyunCategory }))}>
                  <option value="read_word">read_word</option>
                  <option value="read_sentence">read_sentence</option>
                  <option value="read_chapter">read_chapter</option>
                </select>
                <label>Endpoint（可选）</label>
                <input type="text" value={runtimeConfigForm.endpoint} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, endpoint: event.target.value }))} placeholder="为空时使用后端默认 endpoint" />
              </>
            )}

            <h3 className="subsection-title">中文语音反馈配置</h3>
            <label className="checkbox-row">
              <input type="checkbox" checked={runtimeConfigForm.enableVoiceFeedback} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, enableVoiceFeedback: event.target.checked }))} />
              <span>ENABLE_VOICE_FEEDBACK（默认开启）</span>
            </label>
            <label>FEEDBACK_TTS_PROVIDER</label>
            <select value={runtimeConfigForm.feedbackProvider} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackProvider: event.target.value as FeedbackTtsProvider }))}>
              <option value="mock">mock</option>
              <option value="xfyun">xfyun</option>
            </select>
            <label>FEEDBACK_VOICE</label>
            <input type="text" value={runtimeConfigForm.feedbackVoice} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackVoice: event.target.value }))} placeholder="xiaoyan" />
            <label>FEEDBACK_SPEED</label>
            <select value={runtimeConfigForm.feedbackSpeed} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackSpeed: event.target.value as FeedbackSpeed }))}>
              <option value="normal">normal</option>
              <option value="slow">slow</option>
            </select>

            {runtimeConfigForm.feedbackProvider === "xfyun" && (
                <>
                  <label>XFYUN_TTS_APP_ID</label>
                  <input type="text" value={runtimeConfigForm.feedbackAppId} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackAppId: event.target.value }))} placeholder="可留空复用后端 XFYUN_APP_ID" />
                  <label>XFYUN_TTS_API_KEY</label>
                  <input type="text" value={runtimeConfigForm.feedbackApiKey} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackApiKey: event.target.value }))} placeholder="可留空复用后端 XFYUN_API_KEY" />
                  <label>XFYUN_TTS_API_SECRET</label>
                  <div className="secret-row">
                    <input type={showFeedbackSecret ? "text" : "password"} value={runtimeConfigForm.feedbackApiSecret} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackApiSecret: event.target.value }))} placeholder={configSaved ? "已保存后清空；如需重存请重新输入" : "请输入 TTS API Secret"} />
                    <button type="button" className="ghost" onClick={() => setShowFeedbackSecret((value) => !value)}>{showFeedbackSecret ? "隐藏" : "显示"}</button>
                  </div>
                  <label>XFYUN_TTS_ENDPOINT（可选）</label>
                  <input type="text" value={runtimeConfigForm.feedbackEndpoint} onChange={(event) => setRuntimeConfigForm((value) => ({ ...value, feedbackEndpoint: event.target.value }))} placeholder="为空时使用后端默认 TTS endpoint" />
                </>
            )}

            <div className="button-grid api-buttons">
              <button onClick={() => void saveRuntimeConfig()} disabled={configBusy}>保存配置</button>
              <button onClick={() => void testRuntimeConfig()} disabled={configBusy}>测试配置</button>
              <button className="ghost" onClick={() => void clearRuntimeConfig()} disabled={configBusy}>清空配置</button>
              <button className="primary" onClick={useMockMode} disabled={configBusy}>使用 Mock 模式</button>
            </div>

            <div className="config-status-grid">
              <div><span>当前 Provider</span><strong>{savedProvider}</strong></div>
              <div><span>配置是否已保存</span><strong>{configSaved ? "已保存" : "未保存"}</strong></div>
              <div><span>configId</span><strong>{currentConfigId || "-"}</strong></div>
              <div><span>测试连接结果</span><strong>{configMessage || "-"}</strong></div>
              <div><span>错误信息</span><strong>{configError || "-"}</strong></div>
            </div>
            <p className="secret-note">安全提示：API Secret 仅随保存/测试请求发送，保存后前端会清空输入框；本页面不会写入 localStorage，也不会在结果区展示 Secret。</p>
          </section>

          <div className="status-grid">
            <div><span>音频来源</span><strong>{audioSource}</strong></div>
            <div><span>录音时长</span><strong>{recordingSeconds}s</strong></div>
            <div><span>当前状态</span><strong>{status}</strong></div>
          </div>
          {message && <p className="message">{message}</p>}

          <div className="players">
            <div><span>标准读音播放器</span><audio controls src={standardAudioUrl} /></div>
            <div><span>待评测音频播放器</span><audio controls src={audioUrl} /></div>
          </div>
        </aside>

        <section className="card results">
          <h2>评测结果区</h2>
          {result ? (
            <>
              <div className="total-score"><span>总分</span><strong>{result.scores.total.toFixed(1)}</strong><em>{result.status} · {result.provider}</em></div>
              <div className="score-list">
                <ScoreBar label="准确度" value={result.scores.accuracy} />
                <ScoreBar label="流利度" value={result.scores.fluency} />
                <ScoreBar label="完整度" value={result.scores.integrity} />
                <ScoreBar label="清晰度" value={result.scores.clarity} />
              </div>
              <div className="info-grid">
                <div><span>ASR 转写文本</span><strong>{result.asrText}</strong></div>
                <div><span>评测状态</span><strong>{status}</strong></div>
                <div><span>Provider</span><strong>{result.provider}</strong></div>
                <div><span>转换前格式</span><strong>{result.originalAudioMimeType || "-"}</strong></div>
                <div><span>转换后格式</span><strong>{result.convertedAudioFormat || "-"}</strong></div>
                <div><span>TTS 耗时</span><strong>{ttsMs ?? 0} ms</strong></div>
                <div><span>上传耗时</span><strong>{result.timing.uploadMs} ms</strong></div>
                <div><span>评测耗时</span><strong>{result.timing.evaluationMs} ms</strong></div>
                <div><span>总耗时</span><strong>{result.timing.totalMs} ms</strong></div>
              </div>
              {result.feedback && (
                  <section className="feedback-card">
                    <div className="feedback-card__header">
                      <h3>中文语音反馈</h3>
                      <span className={result.feedback.errorMessage ? "status-pill warning-pill" : "status-pill ok-pill"}>{result.feedback.audioUrl ? "已生成语音" : "文字反馈可用"}</span>
                    </div>
                    <p className="feedback-text">{result.feedback.text}</p>
                    <div className="feedback-meta">
                      <div><span>TTS Provider</span><strong>{result.feedback.provider}</strong></div>
                      <div><span>TTS 耗时</span><strong>{result.feedback.ttsMs ?? result.timing.feedbackTtsMs ?? 0} ms</strong></div>
                      <div><span>音频时长</span><strong>{result.feedback.durationMs} ms</strong></div>
                      <div><span>生成状态</span><strong>{result.feedback.audioUrl ? "成功" : "无音频"}</strong></div>
                    </div>
                    {result.feedback.audioUrl && (
                        <div className="feedback-player">
                          <button type="button" className="primary" onClick={playFeedbackAudio}>播放语音反馈</button>
                          <audio ref={feedbackAudioRef} controls src={result.feedback.audioUrl} />
                        </div>
                    )}
                    {result.feedback.errorMessage && <p className="feedback-error">语音反馈生成失败，但文字反馈可用：{result.feedback.errorMessage}</p>}
                  </section>
              )}
              <details className="debug-panel">
                <summary>调试信息（不含密钥）</summary>
                <div className="debug-grid">
                  <div><span>provider</span><strong>{result.provider}</strong></div>
                  <div><span>convertedAudioPath</span><strong>{result.convertedAudioPath || "-"}</strong></div>
                  <div><span>xfyun response code</span><strong>{result.xfyunCode ?? "-"}</strong></div>
                  <div><span>xfyun sid</span><strong>{result.xfyunSid || "-"}</strong></div>
                  <div><span>errorCode</span><strong>{result.errorCode || "-"}</strong></div>
                  <div><span>configId</span><strong>{currentConfigId || "-"}</strong></div>
                </div>
                <pre>{JSON.stringify(result.raw, null, 2)?.slice(0, 2500) || "无 raw result"}</pre>
              </details>
              <h3>纠错建议</h3>
              <ul className="suggestions">{result.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
              <h3>单词级结果</h3>
              <div className="word-table">
                <div className="word-head"><span>word</span><span>score</span><span>status</span></div>
                {result.wordScores.length === 0 && <div className="word-row"><span>暂无单词级明细</span><strong>-</strong><em>-</em></div>}
                {result.wordScores.map((item, index) => <div className={`word-row ${scoreClass(item.score)}`} key={`${item.word}-${index}`}><span>{item.word}</span><strong>{item.score.toFixed(1)}</strong><em>{item.status}</em></div>)}
              </div>
            </>
          ) : <div className="empty">提交评测后，这里会展示总分、维度评分、ASR 转写、接口耗时和单词级错词结果。</div>}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

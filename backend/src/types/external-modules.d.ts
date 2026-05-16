declare module "ffmpeg-static" {
    const path: string | null;
    export default path;
}

declare module "fluent-ffmpeg" {
    type FfmpegCallback = (error: Error | null) => void;
    type FfmpegCommand = {
        inputOptions(options: string[]): FfmpegCommand;
        noVideo(): FfmpegCommand;
        audioFrequency(rate: number): FfmpegCommand;
        audioChannels(channels: number): FfmpegCommand;
        audioCodec(codec: string): FfmpegCommand;
        format(format: string): FfmpegCommand;
        on(event: "end", callback: () => void): FfmpegCommand;
        on(event: "error", callback: (error: Error) => void): FfmpegCommand;
        save(outputPath: string): void;
    };
    interface FfmpegFactory {
        (input?: string): FfmpegCommand;
        setFfmpegPath(path: string): void;
        ffprobe(input: string, callback: FfmpegCallback): void;
    }
    const ffmpeg: FfmpegFactory;
    export default ffmpeg;
}

declare module "xml2js" {
    export function parseStringPromise(xml: string, options?: Record<string, unknown>): Promise<unknown>;
}

declare module "ws" {
    import { EventEmitter } from "node:events";
    type RawData = Buffer | ArrayBuffer | Buffer[];
    class WebSocket extends EventEmitter {
        static CONNECTING: number;
        static OPEN: number;
        static CLOSING: number;
        static CLOSED: number;
        readyState: number;
        constructor(address: string);
        send(data: string | Buffer): void;
        close(code?: number): void;
        on(event: "open", listener: () => void): this;
        on(event: "message", listener: (data: RawData) => void): this;
        on(event: "error", listener: (error: Error) => void): this;
        on(event: "close", listener: () => void): this;
    }
    namespace WebSocket {
        export type RawData = Buffer | ArrayBuffer | Buffer[];
    }
    export default WebSocket;
}
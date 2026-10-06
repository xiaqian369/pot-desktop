import { fetch, Body } from '@tauri-apps/api/http';
import { Language } from './info';
import {
    API_TYPE_RESPONSES,
    buildEndpointCandidates,
    buildPromptList,
    buildRequestBody,
    buildRequestHeaders,
    createSseParser,
    extractChatCompletionContent,
    extractResponsesContent,
    extractStreamDelta,
    resolveApiType,
} from './request';

export async function translate(text, from, to, options) {
    const { config, setResult, detect } = options;

    const apiType = resolveApiType(config);
    const headers = buildRequestHeaders(config);
    const promptList = buildPromptList(config, {
        text,
        from,
        to,
        detect: Language[detect],
    });
    const body = buildRequestBody(config, promptList);

    const candidates = buildEndpointCandidates(config, apiType);
    const errors = [];

    for (const candidate of candidates) {
        try {
            if (config.stream) {
                return await translateWithStream(candidate.href, headers, body, apiType, setResult);
            }
            return await translateOnce(candidate.href, headers, body, apiType);
        } catch (error) {
            errors.push(error);
        }
    }

    // 所有候选都失败时抛出默认协议那次的错误，保持原有报错内容。
    throw errors[0];
}

async function translateWithStream(url, headers, body, apiType, setResult) {
    let res;
    try {
        // 流式输出走 WebView 的原生 fetch。pot 的窗口以 --disable-web-security 启动，
        // 因此这里不会受浏览器同源策略（CORS）限制。
        res = await window.fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });
    } catch (e) {
        throw new Error(
            `${e}\n\n流式请求未能发出，请检查请求地址是否可达、是否需要代理；` +
                '也可以先在配置里关闭“流式输出”，改用普通请求确认接口本身是通的。'
        );
    }

    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}\n${await res.text()}`;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parseSse = createSseParser();
    let target = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            for (const event of parseSse(decoder.decode(value, { stream: true }))) {
                if (event.done || !event.json) {
                    continue;
                }
                const delta = extractStreamDelta(event.json, apiType);
                if (delta === '') {
                    continue;
                }
                target += delta;
                if (setResult) {
                    setResult(target + '_');
                } else {
                    await reader.cancel();
                    return '[STREAM]';
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (setResult) {
        setResult(target.trim());
    }
    return target.trim();
}

async function translateOnce(url, headers, body, apiType) {
    const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: Body.json(body),
    });

    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
    }

    const target =
        apiType === API_TYPE_RESPONSES ? extractResponsesContent(res.data) : extractChatCompletionContent(res.data);

    if (target !== '') {
        return target;
    }

    // 有些推理模型会把 token 全花在思考内容上，正文为空，这里给出更明确的提示。
    const reasoning = res.data?.choices?.[0]?.message?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.trim() !== '') {
        throw `模型只返回了思考内容而没有返回正文，请检查 max_tokens 之类的长度参数是否过小。\n\n${JSON.stringify(res.data)}`;
    }
    throw JSON.stringify(res.data);
}

export * from './Config';
export * from './info';
export * from './request';

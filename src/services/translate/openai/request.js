/**
 * OpenAI 兼容接口的请求构造与响应解析。
 *
 * 这个模块只包含纯函数，不依赖 Tauri、浏览器或 React，
 * 因此可以被单独测试（见 request.test 相关的验证脚本）。
 */

export const SERVICE_OPENAI = 'openai';
export const SERVICE_AZURE = 'azure';

export const API_TYPE_CHAT_COMPLETIONS = 'chat_completions';
export const API_TYPE_RESPONSES = 'responses';

export const THINKING_MODE_DEFAULT = 'default';
export const THINKING_MODE_ENABLE = 'enable';
export const THINKING_MODE_DISABLE = 'disable';

export const THINKING_STYLE_OPENAI = 'openai';
export const THINKING_STYLE_OPENROUTER = 'openrouter';
export const THINKING_STYLE_QWEN = 'qwen';
export const THINKING_STYLE_ANTHROPIC = 'anthropic';
export const THINKING_STYLE_GEMINI = 'gemini';
export const THINKING_STYLE_CUSTOM = 'custom';

export const defaultRequestArguments = '{}';

export const defaultPromptList = [
    {
        role: 'system',
        content:
            'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.',
    },
    { role: 'user', content: `Translate into $to:\n"""\n$text\n"""` },
];

export function resolveApiType(config = {}) {
    return config.apiType === API_TYPE_RESPONSES ? API_TYPE_RESPONSES : API_TYPE_CHAT_COMPLETIONS;
}

function toNumber(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function stripWrappingQuotes(text) {
    let result = text;
    if (result.startsWith('"')) {
        result = result.slice(1);
    }
    if (result.endsWith('"')) {
        result = result.slice(0, -1);
    }
    return result.trim();
}

/**
 * 归一化请求地址。
 *
 * 支持用户填写各种形态的地址，统一补全为真正的接口地址：
 *   https://api.openai.com                       -> https://api.openai.com/v1/chat/completions
 *   https://api.openai.com/v1                    -> https://api.openai.com/v1/chat/completions
 *   192.168.1.10:8000/v1                         -> https://192.168.1.10:8000/v1/chat/completions
 *   https://opencode.ai/zen/go/v1                -> https://opencode.ai/zen/go/v1/chat/completions
 *   https://x/v1/chat/completions                -> 按 apiType 换成 /v1/chat/completions 或 /v1/responses
 *
 * Azure 的地址本身就是完整的（带 deployment 和 api-version），不做任何改写。
 */
export function normalizeEndpoint({ service = SERVICE_OPENAI, requestPath = '', apiType = API_TYPE_CHAT_COMPLETIONS } = {}) {
    let raw = String(requestPath ?? '').trim();
    if (raw === '') {
        raw = 'https://api.openai.com';
    }
    if (!/^https?:\/\//i.test(raw)) {
        raw = `https://${raw}`;
    }
    const url = new URL(raw);

    if (service === SERVICE_AZURE) {
        return url;
    }

    const suffix = apiType === API_TYPE_RESPONSES ? 'responses' : 'chat/completions';
    const endpointPattern = /\/(?:chat\/completions|responses|completions)$/i;
    let pathname = url.pathname.replace(/\/+$/, '');

    if (endpointPattern.test(pathname)) {
        pathname = pathname.replace(endpointPattern, `/${suffix}`);
    } else if (/\/v\d+$/i.test(pathname)) {
        pathname = `${pathname}/${suffix}`;
    } else {
        pathname = `${pathname}/v1/${suffix}`;
    }

    url.pathname = pathname;
    return url;
}

export function hasExplicitProtocol(requestPath) {
    return /^https?:\/\//i.test(String(requestPath ?? '').trim());
}

/**
 * 请求地址可能是随手写的域名，没带协议。这时默认按 https 处理，
 * 但额外准备一个 http 候选地址：局域网自建服务、内网穿透（通常只有 http）
 * 直接填域名也能跑通，不需要用户去纠结协议。
 * 显式写了协议、或 Azure 这类地址本身就是完整的，不会做任何探测。
 */
export function buildEndpointCandidates(config = {}, apiType = API_TYPE_CHAT_COMPLETIONS) {
    const primary = normalizeEndpoint({ service: config.service, requestPath: config.requestPath, apiType });

    if (config.service === SERVICE_AZURE || hasExplicitProtocol(config.requestPath)) {
        return [primary];
    }

    const fallback = new URL(primary.href);
    if (fallback.protocol !== 'https:') {
        return [primary];
    }
    fallback.protocol = 'http:';
    return [primary, fallback];
}

export function substituteVariables(value, config = {}) {
    return String(value ?? '').replaceAll('$apiKey', String(config.apiKey ?? ''));
}

/**
 * 构造请求头：内置鉴权头 + 用户自定义头（自定义的优先级更高，可覆盖鉴权头）。
 */
export function buildRequestHeaders(config = {}) {
    const { service = SERVICE_OPENAI, apiKey = '', customHeaders = [] } = config;
    const headers = { 'Content-Type': 'application/json' };

    const key = String(apiKey ?? '').trim();
    if (key !== '') {
        if (service === SERVICE_AZURE) {
            headers['api-key'] = key;
        } else {
            headers['Authorization'] = `Bearer ${key}`;
        }
    }

    for (const item of customHeaders ?? []) {
        const name = String(item?.key ?? '').trim();
        if (name === '' || item?.enabled === false) {
            continue;
        }
        headers[name] = substituteVariables(item?.value, config);
    }

    return headers;
}

function applyGenerationParams(body, config, apiType) {
    const generation = config.generation ?? {};
    const assign = (name, value) => {
        const parsed = toNumber(value);
        if (parsed !== undefined) {
            body[name] = parsed;
        }
    };

    assign('temperature', generation.temperature);
    assign('top_p', generation.topP);
    assign('top_k', generation.topK);
    assign('frequency_penalty', generation.frequencyPenalty);
    assign('presence_penalty', generation.presencePenalty);
    assign('repetition_penalty', generation.repetitionPenalty);
    assign('seed', generation.seed);
    assign(apiType === API_TYPE_RESPONSES ? 'max_output_tokens' : 'max_tokens', generation.maxTokens);
}

/**
 * 不同厂商的“思考/推理”参数名各不相同，这里按风格展开。
 * 返回空对象表示不注入任何字段（由用户在“额外请求体参数”里自行填写）。
 */
export function buildReasoningParams(config = {}) {
    const thinking = config.thinking ?? {};
    const mode = thinking.mode ?? THINKING_MODE_DEFAULT;
    if (mode === THINKING_MODE_DEFAULT) {
        return {};
    }

    const style = thinking.style ?? THINKING_STYLE_OPENAI;
    if (style === THINKING_STYLE_CUSTOM) {
        return {};
    }

    const enabled = mode === THINKING_MODE_ENABLE;
    const effort = String(thinking.effort ?? '').trim();
    const budget = toNumber(thinking.budget);

    switch (style) {
        case THINKING_STYLE_OPENAI: {
            if (!enabled) {
                return { reasoning_effort: 'minimal' };
            }
            return { reasoning_effort: effort === '' ? 'medium' : effort };
        }
        case THINKING_STYLE_OPENROUTER: {
            const reasoning = { enabled };
            if (enabled) {
                if (effort !== '') {
                    reasoning.effort = effort;
                }
                if (budget !== undefined) {
                    reasoning.max_tokens = budget;
                }
            }
            return { reasoning };
        }
        case THINKING_STYLE_QWEN: {
            const params = { enable_thinking: enabled };
            if (enabled && budget !== undefined) {
                params.thinking_budget = budget;
            }
            return params;
        }
        case THINKING_STYLE_ANTHROPIC: {
            if (!enabled) {
                return { thinking: { type: 'disabled' } };
            }
            return { thinking: { type: 'enabled', budget_tokens: budget ?? 2048 } };
        }
        case THINKING_STYLE_GEMINI: {
            if (!enabled) {
                return { thinkingConfig: { thinkingBudget: 0 } };
            }
            const thinkingConfig = { include_thoughts: true };
            if (budget !== undefined) {
                thinkingConfig.thinkingBudget = budget;
            }
            return { thinkingConfig };
        }
        default:
            return {};
    }
}

/**
 * 把字符串按 JSON 解析，解析不了就当普通字符串。
 */
export function parseLooseValue(value) {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
        return '';
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

export function buildExtraBodyParams(config = {}) {
    const params = {};
    for (const item of config.extraBodyParams ?? []) {
        const name = String(item?.key ?? '').trim();
        if (name === '' || item?.enabled === false) {
            continue;
        }
        params[name] = parseLooseValue(item?.value);
    }
    return params;
}

export function parseRequestArguments(requestArguments) {
    if (requestArguments === undefined || requestArguments === null) {
        return {};
    }
    if (typeof requestArguments === 'object') {
        return requestArguments;
    }
    const trimmed = String(requestArguments).trim();
    if (trimmed === '') {
        return {};
    }
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Request Arguments must be a JSON object.');
    }
    return parsed;
}

/**
 * promptList 里含 $text/$from/$to/$detect 占位符，这里做替换。
 */
export function buildPromptList(config = {}, replacements = {}) {
    const source = config.promptList && config.promptList.length > 0 ? config.promptList : defaultPromptList;
    return source.map((item) => {
        let content = String(item?.content ?? '');
        for (const [name, value] of Object.entries(replacements)) {
            content = content.replaceAll(`$${name}`, String(value ?? ''));
        }
        return { ...item, content };
    });
}

export function buildResponsesInput(promptList = []) {
    const input = [];
    let instructions = '';

    for (const message of promptList) {
        const role = message?.role ?? 'user';
        const content = String(message?.content ?? '');
        if (role === 'system' || role === 'developer') {
            instructions = instructions === '' ? content : `${instructions}\n\n${content}`;
            continue;
        }
        input.push({
            role,
            content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: content }],
        });
    }

    return { instructions, input };
}

/**
 * 组装请求体。
 *
 * 优先级（后者覆盖前者）：生成参数 -> 思考参数 -> 额外请求体参数 -> Request Arguments(JSON)。
 * stream / model / messages(或 input) 由程序决定，避免互相打架。
 */
export function buildRequestBody(config = {}, promptList = []) {
    const apiType = resolveApiType(config);
    const body = {};

    applyGenerationParams(body, config, apiType);
    Object.assign(body, buildReasoningParams(config));
    Object.assign(body, buildExtraBodyParams(config));
    Object.assign(body, parseRequestArguments(config.requestArguments));

    body.stream = config.stream === true;

    if (config.service !== SERVICE_AZURE && String(config.model ?? '').trim() !== '') {
        body.model = config.model;
    }

    if (apiType === API_TYPE_RESPONSES) {
        const { instructions, input } = buildResponsesInput(promptList);
        body.input = input;
        if (instructions !== '') {
            body.instructions = instructions;
        }
    } else {
        body.messages = promptList;
    }

    return body;
}

export function extractChatCompletionContent(data) {
    const message = data?.choices?.[0]?.message;
    if (!message) {
        return '';
    }
    let content = message.content;
    if (Array.isArray(content)) {
        content = content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('');
    }
    if (typeof content !== 'string') {
        content = '';
    }
    return stripWrappingQuotes(content.trim());
}

export function extractResponsesContent(data) {
    if (typeof data?.output_text === 'string' && data.output_text.trim() !== '') {
        return stripWrappingQuotes(data.output_text.trim());
    }

    const output = data?.output;
    if (!Array.isArray(output)) {
        return '';
    }

    let text = '';
    for (const item of output) {
        if (item?.type && item.type !== 'message') {
            continue;
        }
        for (const part of item?.content ?? []) {
            if (typeof part?.text === 'string') {
                text += part.text;
            }
        }
    }
    return stripWrappingQuotes(text.trim());
}

export function extractMessageContent(data, apiType) {
    return resolveApiType({ apiType }) === API_TYPE_RESPONSES
        ? extractResponsesContent(data)
        : extractChatCompletionContent(data);
}

/**
 * 增量解析 SSE 流。返回一个 push(chunk) -> events 的函数。
 * events 元素形如 { json } 或 { done: true }。
 */
export function createSseParser() {
    let buffer = '';
    let pending = '';

    return function push(chunk) {
        const events = [];
        buffer += chunk;

        let index;
        while ((index = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (line.endsWith('\r')) {
                line = line.slice(0, -1);
            }
            if (line === '' || line.startsWith(':') || !line.startsWith('data:')) {
                continue;
            }

            const payload = line.slice(5).trim();
            if (payload === '') {
                continue;
            }

            pending = pending === '' ? payload : `${pending}${payload}`;
            if (pending === '[DONE]') {
                pending = '';
                events.push({ done: true });
                continue;
            }

            try {
                const json = JSON.parse(pending);
                pending = '';
                events.push({ json });
            } catch {
                // 数据跨行了，等下一块 chunk 补全
            }
        }

        return events;
    };
}

export function extractStreamDelta(json, apiType) {
    if (apiType === API_TYPE_RESPONSES) {
        if (json?.type === 'response.output_text.delta' && typeof json.delta === 'string') {
            return json.delta;
        }
        return '';
    }

    const delta = json?.choices?.[0]?.delta;
    if (!delta) {
        return '';
    }

    let content = delta.content;
    if (Array.isArray(content)) {
        content = content.map((part) => part?.text ?? '').join('');
    }
    return typeof content === 'string' ? content : '';
}

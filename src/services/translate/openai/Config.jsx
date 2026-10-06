import {
    Input,
    Button,
    Switch,
    Textarea,
    Card,
    CardBody,
    Link,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    Select,
    SelectItem,
    Accordion,
    AccordionItem,
    Tooltip,
} from '@nextui-org/react';
import { MdDeleteOutline, MdAdd } from 'react-icons/md';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/api/shell';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { translate } from './index';
import { Language } from './index';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import {
    API_TYPE_CHAT_COMPLETIONS,
    API_TYPE_RESPONSES,
    THINKING_MODE_DEFAULT,
    THINKING_MODE_DISABLE,
    THINKING_MODE_ENABLE,
    THINKING_STYLE_ANTHROPIC,
    THINKING_STYLE_CUSTOM,
    THINKING_STYLE_GEMINI,
    THINKING_STYLE_OPENAI,
    THINKING_STYLE_OPENROUTER,
    THINKING_STYLE_QWEN,
    defaultPromptList,
    defaultRequestArguments,
    parseRequestArguments,
} from './request';

export { defaultRequestArguments };

const EMPTY_GENERATION = {
    temperature: '',
    topP: '',
    topK: '',
    frequencyPenalty: '',
    presencePenalty: '',
    repetitionPenalty: '',
    maxTokens: '',
    seed: '',
};

const EMPTY_THINKING = {
    mode: THINKING_MODE_DEFAULT,
    style: THINKING_STYLE_OPENAI,
    effort: '',
    budget: '',
};

// requestArguments 里可以搬到结构化字段的参数名
const MIGRATABLE_ARGUMENTS = {
    temperature: 'temperature',
    top_p: 'topP',
    top_k: 'topK',
    frequency_penalty: 'frequencyPenalty',
    presence_penalty: 'presencePenalty',
    repetition_penalty: 'repetitionPenalty',
    max_tokens: 'maxTokens',
    seed: 'seed',
};

const GENERATION_FIELDS = [
    { key: 'temperature', label: 'temperature', placeholder: '0.1' },
    { key: 'topP', label: 'top_p', placeholder: '0.99' },
    { key: 'topK', label: 'top_k', placeholder: '40' },
    { key: 'maxTokens', label: 'max_tokens', placeholder: '2048' },
    { key: 'frequencyPenalty', label: 'frequency_penalty', placeholder: '0' },
    { key: 'presencePenalty', label: 'presence_penalty', placeholder: '0' },
    { key: 'repetitionPenalty', label: 'repetition_penalty', placeholder: '1' },
    { key: 'seed', label: 'seed', placeholder: '42' },
];

const THINKING_MODES = [THINKING_MODE_DEFAULT, THINKING_MODE_ENABLE, THINKING_MODE_DISABLE];

const THINKING_STYLES = [
    THINKING_STYLE_OPENAI,
    THINKING_STYLE_OPENROUTER,
    THINKING_STYLE_QWEN,
    THINKING_STYLE_ANTHROPIC,
    THINKING_STYLE_GEMINI,
    THINKING_STYLE_CUSTOM,
];

/**
 * 快速预设：只填充请求地址、API 类型与必要的请求头，不会覆盖 Api Key 与模型名。
 */
const PRESETS = [
    {
        key: 'openai',
        label: 'OpenAI',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://api.openai.com/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENAI },
        },
    },
    {
        key: 'openai_responses',
        label: 'OpenAI Responses API',
        patch: {
            service: 'openai',
            apiType: API_TYPE_RESPONSES,
            requestPath: 'https://api.openai.com/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENAI },
        },
    },
    {
        key: 'openrouter',
        label: 'OpenRouter',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://openrouter.ai/api/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENROUTER },
        },
    },
    {
        key: 'deepseek',
        label: 'DeepSeek',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://api.deepseek.com/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENAI },
        },
    },
    {
        key: 'dashscope',
        label: '阿里云百炼 / Qwen',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_QWEN },
        },
    },
    {
        key: 'siliconflow',
        label: 'SiliconFlow 硅基流动',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://api.siliconflow.cn/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_QWEN },
        },
    },
    {
        key: 'zhipu',
        label: '智谱 BigModel',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://open.bigmodel.cn/api/paas/v4',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENAI },
        },
    },
    {
        key: 'moonshot',
        label: 'Moonshot / Kimi',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://api.moonshot.cn/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENAI },
        },
    },
    {
        key: 'opencode_zen',
        label: 'OpenCode Zen (go)',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://opencode.ai/zen/go/v1',
            customHeaders: [{ key: 'x-opencode-session', value: 'pot-desktop' }],
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_OPENAI },
        },
    },
    {
        key: 'local',
        label: '本地 / 自建服务 (vLLM, LM Studio, One-API...)',
        patch: {
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'http://127.0.0.1:8000/v1',
            thinking: { ...EMPTY_THINKING, style: THINKING_STYLE_QWEN },
        },
    },
];

/**
 * 补齐旧版本配置缺失的字段，并把老版本写在 requestArguments 里的采样参数搬到结构化字段，
 * 这样配置页显示的数值与实际发出的请求保持一致。
 */
function normalizeConfig(config) {
    let changed = false;
    const next = { ...config };

    if (!Array.isArray(next.promptList) || next.promptList.length === 0) {
        next.promptList = defaultPromptList;
        changed = true;
    }
    if (next.customHeaders === undefined) {
        next.customHeaders = [];
        changed = true;
    }
    if (next.extraBodyParams === undefined) {
        next.extraBodyParams = [];
        changed = true;
    }
    if (next.apiType === undefined) {
        next.apiType = API_TYPE_CHAT_COMPLETIONS;
        changed = true;
    }
    if (next.thinking === undefined) {
        next.thinking = { ...EMPTY_THINKING };
        changed = true;
    }

    if (next.generation === undefined) {
        const generation = { ...EMPTY_GENERATION };
        const rest = {};
        let migratable = true;
        try {
            const parsed = parseRequestArguments(next.requestArguments);
            for (const [key, value] of Object.entries(parsed)) {
                const field = MIGRATABLE_ARGUMENTS[key];
                if (field) {
                    generation[field] = String(value);
                } else {
                    rest[key] = value;
                }
            }
        } catch {
            migratable = false;
        }
        next.generation = generation;
        if (migratable) {
            next.requestArguments = JSON.stringify(rest, null, 4);
        } else if (next.requestArguments === undefined) {
            next.requestArguments = defaultRequestArguments;
        }
        changed = true;
    } else if (next.requestArguments === undefined) {
        next.requestArguments = defaultRequestArguments;
        changed = true;
    }

    return changed ? next : config;
}

function ConfigItem(props) {
    const { label, hint, children } = props;
    return (
        <div className='config-item'>
            {hint ? (
                <div className='my-auto'>
                    <Tooltip content={hint}>
                        <h3 className='my-auto cursor-help'>{label}</h3>
                    </Tooltip>
                </div>
            ) : (
                <h3 className='my-auto'>{label}</h3>
            )}
            {children}
        </div>
    );
}

function PlaceholderEditor(props) {
    const { items, onChange, keyPlaceholder, valuePlaceholder, addLabel } = props;
    const list = items ?? [];

    const update = (index, patch) => {
        onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    return (
        <div className='bg-content2 rounded-[10px] p-3'>
            {list.map((item, index) => (
                <div
                    className='flex gap-2 mb-2'
                    key={index}
                >
                    <Input
                        size='sm'
                        variant='faded'
                        placeholder={keyPlaceholder}
                        value={item.key ?? ''}
                        onValueChange={(value) => update(index, { key: value })}
                    />
                    <Input
                        size='sm'
                        variant='faded'
                        placeholder={valuePlaceholder}
                        value={item.value ?? ''}
                        onValueChange={(value) => update(index, { value })}
                    />
                    <Button
                        isIconOnly
                        size='sm'
                        color='danger'
                        variant='flat'
                        className='my-auto'
                        onPress={() => onChange(list.filter((_, i) => i !== index))}
                    >
                        <MdDeleteOutline className='text-[18px]' />
                    </Button>
                </div>
            ))}
            <Button
                fullWidth
                size='sm'
                startContent={<MdAdd />}
                onPress={() => onChange([...list, { key: '', value: '' }])}
            >
                {addLabel}
            </Button>
        </div>
    );
}

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const [openaiConfig, setOpenaiConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.translate.openai.title'),
            service: 'openai',
            apiType: API_TYPE_CHAT_COMPLETIONS,
            requestPath: 'https://api.openai.com/v1',
            model: 'gpt-3.5-turbo',
            apiKey: '',
            stream: false,
            customHeaders: [],
            generation: { temperature: '0.1', topP: '0.99' },
            thinking: { ...EMPTY_THINKING },
            extraBodyParams: [],
            promptList: defaultPromptList,
            requestArguments: defaultRequestArguments,
        },
        { sync: false }
    );

    // 兼容旧版本配置
    if (openaiConfig !== null) {
        const normalized = normalizeConfig(openaiConfig);
        if (normalized !== openaiConfig) {
            setOpenaiConfig(normalized);
        }
    }

    const [isLoading, setIsLoading] = useState(false);

    const toastStyle = useToastStyle();

    const updateConfig = (patch) => {
        setOpenaiConfig({ ...openaiConfig, ...patch });
    };
    const updateGeneration = (patch) => {
        updateConfig({ generation: { ...openaiConfig.generation, ...patch } });
    };
    const updateThinking = (patch) => {
        updateConfig({ thinking: { ...openaiConfig.thinking, ...patch } });
    };

    const applyPreset = (key) => {
        const preset = PRESETS.find((item) => item.key === key);
        if (!preset) {
            return;
        }
        updateConfig(preset.patch);
        toast.success(t('services.translate.openai.preset_applied'), { style: toastStyle });
    };

    return (
        openaiConfig !== null && (
            <form
                onSubmit={(e) => {
                    e.preventDefault();

                    try {
                        parseRequestArguments(openaiConfig.requestArguments);
                    } catch {
                        toast.error(t('services.translate.openai.request_arguments_invalid'), { style: toastStyle });
                        return;
                    }

                    setIsLoading(true);
                    translate('hello', Language.auto, Language.zh_cn, { config: openaiConfig }).then(
                        () => {
                            setIsLoading(false);
                            setOpenaiConfig(openaiConfig, true);
                            updateServiceList(instanceKey);
                            onClose();
                        },
                        (e) => {
                            setIsLoading(false);
                            toast.error(t('config.service.test_failed') + e.toString(), { style: toastStyle });
                        }
                    );
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={openaiConfig[INSTANCE_NAME_CONFIG_KEY]}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            updateConfig({ [INSTANCE_NAME_CONFIG_KEY]: value });
                        }}
                    />
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('services.help')}</h3>
                    <Button
                        onPress={() => {
                            open('https://pot-app.com/docs/api/translate/openai.html');
                        }}
                    >
                        {t('services.help')}
                    </Button>
                </div>
                <ConfigItem label={t('services.translate.openai.preset')}>
                    <Select
                        aria-label='preset'
                        variant='bordered'
                        className='max-w-[50%]'
                        placeholder={t('services.translate.openai.preset_placeholder')}
                        selectedKeys={[]}
                        onSelectionChange={(keys) => {
                            const key = Array.from(keys)[0];
                            if (key) {
                                applyPreset(key);
                            }
                        }}
                    >
                        {PRESETS.map((preset) => (
                            <SelectItem key={preset.key}>{preset.label}</SelectItem>
                        ))}
                    </Select>
                </ConfigItem>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('services.translate.openai.service')}</h3>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button variant='bordered'>{t(`services.translate.openai.${openaiConfig.service}`)}</Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            autoFocus='first'
                            aria-label='service'
                            onAction={(key) => {
                                updateConfig({ service: key });
                            }}
                        >
                            <DropdownItem key='openai'>{t(`services.translate.openai.openai`)}</DropdownItem>
                            <DropdownItem key='azure'>{t(`services.translate.openai.azure`)}</DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                </div>
                <ConfigItem
                    label={t('services.translate.openai.api_type')}
                    hint={t('services.translate.openai.api_type_description')}
                >
                    <Select
                        aria-label='api-type'
                        variant='bordered'
                        className='max-w-[50%]'
                        selectedKeys={[openaiConfig.apiType ?? API_TYPE_CHAT_COMPLETIONS]}
                        onSelectionChange={(keys) => {
                            const key = Array.from(keys)[0];
                            updateConfig({ apiType: key ?? API_TYPE_CHAT_COMPLETIONS });
                        }}
                    >
                        <SelectItem key={API_TYPE_CHAT_COMPLETIONS}>
                            {t('services.translate.openai.api_type_chat_completions')}
                        </SelectItem>
                        <SelectItem key={API_TYPE_RESPONSES}>
                            {t('services.translate.openai.api_type_responses')}
                        </SelectItem>
                    </Select>
                </ConfigItem>
                <div className='config-item'>
                    <Switch
                        isSelected={openaiConfig['stream']}
                        onValueChange={(value) => {
                            updateConfig({ stream: value });
                        }}
                        classNames={{
                            base: 'flex flex-row-reverse justify-between w-full max-w-full',
                        }}
                    >
                        {t('services.translate.openai.stream')}
                    </Switch>
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.openai.request_path')}
                        labelPlacement='outside-left'
                        value={openaiConfig['requestPath']}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            updateConfig({ requestPath: value });
                        }}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.openai.api_key')}
                        labelPlacement='outside-left'
                        type='password'
                        value={openaiConfig['apiKey']}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            updateConfig({ apiKey: value });
                        }}
                    />
                </div>
                <Card
                    isBlurred
                    className='border-none bg-success/20 dark:bg-success/10'
                    shadow='sm'
                >
                    <CardBody>
                        <div>
                            推荐
                            <Link
                                isExternal
                                href='https://aihubmix.com/register?aff=trJY'
                                color='primary'
                            >
                                AiHubMix
                            </Link>
                            的OpenAI API 密钥，速度飞快，经济实惠，1美元的OpenAI API 额度只需人民币6.3元
                            <Link
                                isExternal
                                href='https://pot-app.com/ads/aihubmix.html'
                                color='primary'
                            >
                                配置文档
                            </Link>
                        </div>
                    </CardBody>
                </Card>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.openai.model')}
                        labelPlacement='outside-left'
                        value={openaiConfig['model']}
                        variant='bordered'
                        classNames={{
                            base: 'justify-between',
                            label: 'text-[length:--nextui-font-size-medium]',
                            mainWrapper: 'max-w-[50%]',
                        }}
                        onValueChange={(value) => {
                            updateConfig({ model: value });
                        }}
                    />
                </div>

                <Accordion
                    variant='slim'
                    className='px-0'
                >
                    <AccordionItem
                        key='generation'
                        aria-label='generation'
                        title={t('services.translate.openai.generation')}
                        subtitle={t('services.translate.openai.generation_subtitle')}
                    >
                        <div className='grid grid-cols-2 gap-x-3'>
                            {GENERATION_FIELDS.map((field) => (
                                <Input
                                    key={field.key}
                                    type='number'
                                    size='sm'
                                    variant='faded'
                                    label={field.label}
                                    labelPlacement='outside'
                                    placeholder={field.placeholder}
                                    value={openaiConfig.generation?.[field.key] ?? ''}
                                    onValueChange={(value) => {
                                        updateGeneration({ [field.key]: value });
                                    }}
                                />
                            ))}
                        </div>
                        <p className='text-[10px] text-default-700 mt-2'>
                            {t('services.translate.openai.generation_description')}
                        </p>
                    </AccordionItem>

                    <AccordionItem
                        key='thinking'
                        aria-label='thinking'
                        title={t('services.translate.openai.thinking')}
                        subtitle={t('services.translate.openai.thinking_subtitle')}
                    >
                        <div className='grid grid-cols-2 gap-x-3 gap-y-2'>
                            <Select
                                size='sm'
                                variant='faded'
                                aria-label='thinking-mode'
                                label={t('services.translate.openai.thinking_mode')}
                                labelPlacement='outside'
                                selectedKeys={[openaiConfig.thinking?.mode ?? THINKING_MODE_DEFAULT]}
                                onSelectionChange={(keys) => {
                                    updateThinking({ mode: Array.from(keys)[0] ?? THINKING_MODE_DEFAULT });
                                }}
                            >
                                {THINKING_MODES.map((mode) => (
                                    <SelectItem key={mode}>
                                        {t(`services.translate.openai.thinking_mode_${mode}`)}
                                    </SelectItem>
                                ))}
                            </Select>
                            <Select
                                size='sm'
                                variant='faded'
                                aria-label='thinking-style'
                                label={t('services.translate.openai.thinking_style')}
                                labelPlacement='outside'
                                selectedKeys={[openaiConfig.thinking?.style ?? THINKING_STYLE_OPENAI]}
                                onSelectionChange={(keys) => {
                                    updateThinking({ style: Array.from(keys)[0] ?? THINKING_STYLE_OPENAI });
                                }}
                            >
                                {THINKING_STYLES.map((style) => (
                                    <SelectItem key={style}>
                                        {t(`services.translate.openai.thinking_style_${style}`)}
                                    </SelectItem>
                                ))}
                            </Select>
                            <Input
                                size='sm'
                                variant='faded'
                                label={t('services.translate.openai.thinking_effort')}
                                labelPlacement='outside'
                                placeholder='low / medium / high'
                                value={openaiConfig.thinking?.effort ?? ''}
                                onValueChange={(value) => {
                                    updateThinking({ effort: value });
                                }}
                            />
                            <Input
                                size='sm'
                                type='number'
                                variant='faded'
                                label={t('services.translate.openai.thinking_budget')}
                                labelPlacement='outside'
                                placeholder='2048'
                                value={openaiConfig.thinking?.budget ?? ''}
                                onValueChange={(value) => {
                                    updateThinking({ budget: value });
                                }}
                            />
                        </div>
                        <p className='text-[10px] text-default-700 mt-2'>
                            {t('services.translate.openai.thinking_description')}
                        </p>
                    </AccordionItem>

                    <AccordionItem
                        key='headers'
                        aria-label='headers'
                        title={t('services.translate.openai.custom_headers')}
                        subtitle={t('services.translate.openai.custom_headers_subtitle')}
                    >
                        <PlaceholderEditor
                            items={openaiConfig.customHeaders}
                            onChange={(items) => {
                                updateConfig({ customHeaders: items });
                            }}
                            keyPlaceholder='x-opencode-session'
                            valuePlaceholder={t('services.translate.openai.value_placeholder')}
                            addLabel={t('services.translate.openai.add_header')}
                        />
                        <p className='text-[10px] text-default-700 mt-2'>
                            {t('services.translate.openai.custom_headers_description')}
                        </p>
                    </AccordionItem>

                    <AccordionItem
                        key='extra-body'
                        aria-label='extra-body'
                        title={t('services.translate.openai.extra_body')}
                        subtitle={t('services.translate.openai.extra_body_subtitle')}
                    >
                        <PlaceholderEditor
                            items={openaiConfig.extraBodyParams}
                            onChange={(items) => {
                                updateConfig({ extraBodyParams: items });
                            }}
                            keyPlaceholder='chat_template_kwargs'
                            valuePlaceholder='{"enable_thinking": false}'
                            addLabel={t('services.translate.openai.add_param')}
                        />
                        <p className='text-[10px] text-default-700 mt-2'>
                            {t('services.translate.openai.extra_body_description')}
                        </p>
                    </AccordionItem>

                    <AccordionItem
                        key='request-arguments'
                        aria-label='request-arguments'
                        title={t('services.translate.openai.request_arguments')}
                        subtitle={t('services.translate.openai.request_arguments_subtitle')}
                    >
                        <Textarea
                            label=''
                            labelPlacement='outside'
                            variant='faded'
                            minRows={3}
                            value={openaiConfig['requestArguments']}
                            placeholder={`Input API Request Arguments`}
                            onValueChange={(value) => {
                                updateConfig({ requestArguments: value });
                            }}
                        />
                        <p className='text-[10px] text-default-700 mt-2'>
                            {t('services.translate.openai.request_arguments_description')}
                        </p>
                    </AccordionItem>
                </Accordion>

                <h3 className='my-auto'>Prompt List</h3>
                <p className='text-[10px] text-default-700'>{t('services.translate.openai.prompt_description')}</p>

                <div className='bg-content2 rounded-[10px] p-3'>
                    {openaiConfig.promptList &&
                        openaiConfig.promptList.map((prompt, index) => {
                            return (
                                <div
                                    className='config-item'
                                    key={index}
                                >
                                    <Textarea
                                        label={prompt.role}
                                        labelPlacement='outside'
                                        variant='faded'
                                        value={prompt.content}
                                        placeholder={`Input Some ${prompt.role} Prompt`}
                                        onValueChange={(value) => {
                                            updateConfig({
                                                promptList: openaiConfig.promptList.map((p, i) => {
                                                    if (i === index) {
                                                        if (i === 0) {
                                                            return {
                                                                role: 'system',
                                                                content: value,
                                                            };
                                                        } else {
                                                            return {
                                                                role: index % 2 !== 0 ? 'user' : 'assistant',
                                                                content: value,
                                                            };
                                                        }
                                                    } else {
                                                        return p;
                                                    }
                                                }),
                                            });
                                        }}
                                    />
                                    <Button
                                        isIconOnly
                                        color='danger'
                                        className='my-auto mx-1'
                                        variant='flat'
                                        onPress={() => {
                                            updateConfig({
                                                promptList: openaiConfig.promptList.filter((_, i) => i !== index),
                                            });
                                        }}
                                    >
                                        <MdDeleteOutline className='text-[18px]' />
                                    </Button>
                                </div>
                            );
                        })}
                    <Button
                        fullWidth
                        onPress={() => {
                            updateConfig({
                                promptList: [
                                    ...openaiConfig.promptList,
                                    {
                                        role:
                                            openaiConfig.promptList.length === 0
                                                ? 'system'
                                                : openaiConfig.promptList.length % 2 === 0
                                                  ? 'assistant'
                                                  : 'user',
                                        content: '',
                                    },
                                ],
                            });
                        }}
                    >
                        {t('services.translate.openai.add')}
                    </Button>
                </div>
                <br />
                <Button
                    type='submit'
                    isLoading={isLoading}
                    fullWidth
                    color='primary'
                >
                    {t('common.save')}
                </Button>
            </form>
        )
    );
}

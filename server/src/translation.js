import { franc } from 'franc-min';

function detectLanguage(text) {
  if (!text.trim()) return null;

  // Detect Chinese characters
  if (/\p{Script=Han}/u.test(text)) {
    return 'zh-CN';
  }

  const detected = franc(text, {
    only: ['eng', 'zlm', 'cmn'],
    minLength: 5,
  });

  const languages = {
    eng: 'en',
    zlm: 'ms',
    cmn: 'zh-CN',
  };

  return languages[detected] || null;
}

function splitText(text) {
  const chunks = [];
  let chunk = '';

  for (const char of text) {
    if (Buffer.byteLength(chunk + char, 'utf8') > 500) {
      const boundary = chunk.lastIndexOf(' ');

      if (boundary > 0) {
        chunks.push(chunk.slice(0, boundary));
        chunk = chunk.slice(boundary + 1);
      } else {
        chunks.push(chunk);
        chunk = '';
      }
    }

    chunk += char;
  }

  if (chunk.trim()) chunks.push(chunk);

  return chunks;
}

export async function translateToEnglish(text, language, target = 'en') {
  const source = language || detectLanguage(text);

  if (!['en', 'ms', 'zh-CN'].includes(source)) {
    throw new Error('Unable to detect language. Select the source language.');
  }

  if (!['en', 'ms', 'zh-CN'].includes(target)) {
    throw new Error('Invalid target language.');
  }

  if (source === target) {
    return {
      translatedText: text,
      detectedLanguage: source,
      targetLanguage: target,
      sameLanguage: true,
    };
  }

  const translations = [];

  for (const chunk of splitText(text)) {
    const params = new URLSearchParams({
      q: chunk,
      langpair: `${source}|${target}`,
    });

    const response = await fetch(
      `https://api.mymemory.translated.net/get?${params}`,
      { signal: AbortSignal.timeout(15000) }
    );

    const data = await response.json();

    if (
      !response.ok ||
      Number(data.responseStatus) !== 200 ||
      !data.responseData?.translatedText
    ) {
      throw new Error('Translation service unavailable.');
    }

    translations.push(data.responseData.translatedText);
  }

  return {
    translatedText: translations.join(' '),
    detectedLanguage: source,
    alreadyEnglish: false,
  };
}
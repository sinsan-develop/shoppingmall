import { readFileSync } from 'node:fs';

const required = ['목적', '변경 요약', '영향', '검증', '미검증', '롤백'];

try {
  const body = readFileSync(process.argv[2], 'utf8');
  const withoutComments = body.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  let fence;
  const visible = withoutComments.replace(/\r\n/g, '\n').split('\n').map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()))) {
      fence = fence ? undefined : marker[1];
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
  const headings = [...visible.matchAll(/^## ([^\n]+)$/gm)];

  for (const title of required) {
    const sections = headings.filter((heading) => heading[1] === title);
    if (sections.length !== 1) {
      throw new Error(`PR 본문의 '${title}' 항목은 정확히 한 번 필요합니다.`);
    }

    const heading = sections[0];
    const next = headings.find((candidate) => candidate.index > heading.index);
    const content = visible.slice(heading.index + heading[0].length, next?.index ?? visible.length).trim();
    if (!content || /^(?:[-*]\s*)?(TODO|TBD|추후)$/i.test(content)) {
      throw new Error(`PR 본문의 '${title}' 항목에 실제 내용을 적어야 합니다.`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

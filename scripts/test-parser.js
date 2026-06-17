const fs = require('fs');
const path = require('path');
const { parseDocxBuffer } = require('../cloudfunctions/parseWord/parser/docx');
const { parseQuestionParagraphs } = require('../cloudfunctions/parseWord/parser/questionParser');

async function main() {
  const file = process.argv[2] || 'C:\\Users\\Puppy\\Desktop\\人工智能材料\\shuashuati_word.docx';
  const resolved = path.resolve(file);
  const buffer = fs.readFileSync(resolved);
  const docx = await parseDocxBuffer(buffer);
  const parsed = parseQuestionParagraphs(docx.paragraphs);

  console.log(JSON.stringify({
    file: resolved,
    paragraphs: docx.paragraphs.length,
    questions: parsed.questions.length,
    warnings: parsed.warnings.length,
    errors: parsed.errors.length,
    preview: parsed.questions.slice(0, 8).map((question) => ({
      type: question.type,
      chapter: question.chapter,
      stem: question.stem,
      answer: question.answer,
      options: question.options.map((option) => ({
        key: option.key,
        text: option.text,
        images: option.images.length
      })),
      analysis: question.analysis
    })),
    warningsPreview: parsed.warnings.slice(0, 8),
    errorsPreview: parsed.errors.slice(0, 8)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

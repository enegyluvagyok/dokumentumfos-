import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const PROJECT_ROOT = process.cwd();

const INPUT_DIR = path.join(PROJECT_ROOT, 'mintlify-docs');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output_docx');
const TEMPLATE_PATH = path.join(PROJECT_ROOT, 'sablon.docx');
const REFERENCE_DOCX = path.join(PROJECT_ROOT, 'reference.docx');
const TEMP_DIR = path.join(PROJECT_ROOT, '.tmp-pandoc');

function toPandocPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function safeName(value) {
  return value.replace(/[^\w.-]/g, '_');
}

function convertBracketBlocksToBoxes(content) {
  const lines = content.split(/\r?\n/);
  const output = [];

  let insideBox = false;
  let boxLines = [];

  function flushBox() {
    if (!boxLines.length) return;

    output.push('');
    output.push('> **Megjegyzés**');
    output.push('>');

    boxLines.forEach((line) => {
      output.push(line.trim() === '' ? '>' : `> ${line}`);
    });

    output.push('');
    boxLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '[') {
      insideBox = true;
      boxLines = [];
      continue;
    }

    if (trimmed === ']' && insideBox) {
      flushBox();
      insideBox = false;
      continue;
    }

    if (insideBox) {
      boxLines.push(line);
    } else {
      output.push(line);
    }
  }

  if (insideBox) {
    flushBox();
  }

  return output.join('\n');
}

function cleanMdx(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/^import\s.+$/gm, '');
  content = content.replace(/^export\s.+$/gm, '');

  content = content.replace(/\]\((\/images\/[^)]+)\)/g, (_, imagePath) => {
    const absolutePath = path.join(PROJECT_ROOT, imagePath.replace(/^\//, ''));

    return `](${toPandocPath(absolutePath)})`;
  });

  content = content.replace(/src=["'](\/images\/[^"']+)["']/g, (_, imagePath) => {
    const absolutePath = path.join(PROJECT_ROOT, imagePath.replace(/^\//, ''));

    return `src="${toPandocPath(absolutePath)}"`;
  });

  content = convertBracketBlocksToBoxes(content);

  return content;
}

function getTitleFromMdx(mdxContent, filePath) {
  const match = mdxContent.match(/^#\s+(.+)$/m);

  return match ? match[1].trim() : path.basename(filePath, path.extname(filePath));
}

function getSubtitleFromMdx(mdxContent) {
  const match = mdxContent.match(/^##\s+(.+)$/m);

  return match ? match[1].trim() : '';
}

function getFormattedDate() {
  const now = new Date();

  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(
    2,
    '0'
  )}`;
}

function createPandocDocx(mdxContent, mdxPath) {
  fs.mkdirSync(TEMP_DIR, {
    recursive: true,
  });

  const baseName = safeName(path.basename(mdxPath, path.extname(mdxPath)));

  const tempDocxPath = path.join(TEMP_DIR, `${baseName}-${Date.now()}.docx`);

  const resourcePath = [
    PROJECT_ROOT,
    INPUT_DIR,
    path.join(PROJECT_ROOT, 'images'),
    path.join(PROJECT_ROOT, 'images', 'screenshots'),
    path.dirname(mdxPath),
  ].join(path.delimiter);

  const pandocArgs = ['-f', 'markdown', '-t', 'docx'];

  if (fs.existsSync(REFERENCE_DOCX)) {
    pandocArgs.push('--reference-doc', REFERENCE_DOCX);
  }

  pandocArgs.push(`--resource-path=${resourcePath}`, '--embed-resources', '-o', tempDocxPath);

  execFileSync('pandoc', pandocArgs, {
    input: mdxContent,
    cwd: PROJECT_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 100,
  });

  if (!fs.existsSync(tempDocxPath)) {
    throw new Error('A Pandoc nem generált DOCX fájlt.');
  }

  const buffer = fs.readFileSync(tempDocxPath);

  fs.unlinkSync(tempDocxPath);

  return buffer;
}

function forceParagraphStyle(xml, fromStyleIds, toStyleId) {
  fromStyleIds.forEach((fromStyleId) => {
    const regex = new RegExp(`<w:pStyle w:val="${fromStyleId}"\\s*/>`, 'g');

    xml = xml.replace(regex, `<w:pStyle w:val="${toStyleId}"/>`);
  });

  return xml;
}

function forceNiceStyles(rawXml) {
  let xml = rawXml;

  // -------------------------------------------------
  // CÍM / ALCÍM
  // -------------------------------------------------

  xml = forceParagraphStyle(xml, ['Title', 'Cm'], 'Cmsor1');

  xml = forceParagraphStyle(xml, ['Subtitle', 'Alcm'], 'Cmsor2');

  // -------------------------------------------------
  // CÍMSOROK
  // -------------------------------------------------

  xml = forceParagraphStyle(xml, ['Heading1', 'heading 1', 'Heading 1', 'Cmsor1'], 'Cmsor1');

  xml = forceParagraphStyle(xml, ['Heading2', 'heading 2', 'Heading 2', 'Cmsor2'], 'Cmsor2');

  xml = forceParagraphStyle(xml, ['Heading3', 'heading 3', 'Heading 3', 'Cmsor3'], 'Cmsor3');

  xml = forceParagraphStyle(xml, ['Heading4', 'heading 4', 'Heading 4', 'Cmsor4'], 'Cmsor4');

  xml = forceParagraphStyle(xml, ['Heading5', 'heading 5', 'Heading 5', 'Cmsor5'], 'Cmsor5');

  xml = forceParagraphStyle(xml, ['Heading6', 'heading 6', 'Heading 6', 'Cmsor6'], 'Cmsor6');

  // -------------------------------------------------
  // NORML SZÖVEG
  // -------------------------------------------------

  xml = forceParagraphStyle(
    xml,
    ['Normal', 'Norml', 'BodyText', 'Body Text', 'FirstParagraph', 'Compact', 'PlainText', 'Plain Text'],
    'Norml'
  );

  // -------------------------------------------------
  // IDÉZET / INFO BOX
  // -------------------------------------------------

  xml = forceParagraphStyle(xml, ['Quote', 'BlockText', 'Block Text', 'IntenseQuote', 'Idzet'], 'Nincstrkz');

  // -------------------------------------------------
  // LISTÁK
  // -------------------------------------------------

  xml = forceParagraphStyle(
    xml,
    [
      'ListParagraph',
      'List Paragraph',
      'ListBullet',
      'List Bullet',
      'ListNumber',
      'List Number',
      'ListContinue',
      'List Continue',
    ],
    'Norml'
  );

  // -------------------------------------------------
  // KÉPALÁÍRÁS
  // -------------------------------------------------

  xml = forceParagraphStyle(xml, ['Caption', 'caption', 'ImageCaption', 'FigureCaption'], 'Norml');

  // -------------------------------------------------
  // KÓDBLOKK
  // -------------------------------------------------

  xml = forceParagraphStyle(
    xml,
    ['CodeBlock', 'SourceCode', 'Verbatim', 'VerbatimChar', 'HTMLPreformatted', 'HTML Preformatted'],
    'Nincstrkz'
  );

  // -------------------------------------------------
  // TARTALOMJEGYZÉK
  // -------------------------------------------------

  xml = forceParagraphStyle(xml, ['TOCHeading', 'TOC Heading'], 'Cmsor1');

  xml = forceParagraphStyle(xml, ['TOC1', 'toc 1'], 'Norml');

  xml = forceParagraphStyle(xml, ['TOC2', 'toc 2'], 'Norml');

  xml = forceParagraphStyle(xml, ['TOC3', 'toc 3'], 'Norml');

  xml = forceParagraphStyle(xml, ['TOC4', 'toc 4'], 'Norml');

  xml = forceParagraphStyle(xml, ['TOC5', 'toc 5'], 'Norml');

  xml = forceParagraphStyle(xml, ['TOC6', 'toc 6'], 'Norml');

  // -------------------------------------------------
  // INLINE STYLE CLEANUP
  // -------------------------------------------------

  xml = xml.replace(/<w:rStyle w:val="Hyperlink"\/>/g, '');

  xml = xml.replace(/<w:rStyle w:val="Strong"\/>/g, '<w:b/>');

  xml = xml.replace(/<w:rStyle w:val="Emphasis"\/>/g, '<w:i/>');

  xml = xml.replace(/<w:rStyle w:val="VerbatimChar"\s*\/>/g, '');

  // -------------------------------------------------
  // FOOTNOTE / BIB CLEANUP
  // -------------------------------------------------

  xml = xml.replace(/<w:pStyle w:val="FootnoteText"\/>/g, '<w:pStyle w:val="Norml"/>');

  xml = xml.replace(/<w:pStyle w:val="EndnoteText"\/>/g, '<w:pStyle w:val="Norml"/>');

  xml = xml.replace(/<w:pStyle w:val="Bibliography"\/>/g, '<w:pStyle w:val="Norml"/>');

  return xml;
}

function applyTableBorders(rawXml) {
  return rawXml.replace(/<w:tbl>([\s\S]*?)<\/w:tbl>/g, (fullTable, tableInner) => {
    let updated = tableInner;

    const tblPrMatch = updated.match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/);

    const bordersXml = `
<w:tblBorders>
  <w:top w:val="single" w:sz="8" w:space="0" w:color="B7B7B7"/>
  <w:left w:val="single" w:sz="8" w:space="0" w:color="B7B7B7"/>
  <w:bottom w:val="single" w:sz="8" w:space="0" w:color="B7B7B7"/>
  <w:right w:val="single" w:sz="8" w:space="0" w:color="B7B7B7"/>
  <w:insideH w:val="single" w:sz="6" w:space="0" w:color="D9D9D9"/>
  <w:insideV w:val="single" w:sz="6" w:space="0" w:color="D9D9D9"/>
</w:tblBorders>`;

    const tblLookXml = `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>`;

    if (tblPrMatch) {
      let tblPr = tblPrMatch[0];

      tblPr = tblPr.replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/g, '');

      tblPr = tblPr.replace(/<w:tblLook[^>]*\/>/g, '');

      tblPr = tblPr.replace('</w:tblPr>', `${bordersXml}${tblLookXml}</w:tblPr>`);

      updated = updated.replace(tblPrMatch[0], tblPr);
    } else {
      updated = `<w:tblPr>${bordersXml}${tblLookXml}</w:tblPr>${updated}`;
    }

    updated = updated.replace(
      /<w:tcPr>/g,
      `<w:tcPr><w:tcMar>
<w:top w:w="90" w:type="dxa"/>
<w:left w:w="120" w:type="dxa"/>
<w:bottom w:w="90" w:type="dxa"/>
<w:right w:w="120" w:type="dxa"/>
</w:tcMar>`
    );

    return `<w:tbl>${updated}</w:tbl>`;
  });
}

function styleFirstTableRow(rawXml) {
  return rawXml.replace(/<w:tbl>([\s\S]*?)<\/w:tbl>/g, (fullTable, tableInner) => {
    const firstRowMatch = tableInner.match(/<w:tr>([\s\S]*?)<\/w:tr>/);

    if (!firstRowMatch) {
      return fullTable;
    }

    let firstRow = firstRowMatch[0];

    firstRow = firstRow.replace(/<w:tcPr>/g, `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/>`);

    firstRow = firstRow.replace(/<w:rPr>/g, `<w:rPr><w:b/>`);

    firstRow = firstRow.replace(/<w:rPr\/>/g, `<w:rPr><w:b/></w:rPr>`);

    const updatedInner = tableInner.replace(firstRowMatch[0], firstRow);

    return `<w:tbl>${updatedInner}</w:tbl>`;
  });
}

function polishWordXml(rawXml) {
  let xml = rawXml;

  xml = forceNiceStyles(xml);
  xml = applyTableBorders(xml);
  xml = styleFirstTableRow(xml);

  return xml;
}

function extractPandocBodyXml(pandocZip) {
  const documentFile = pandocZip.file('word/document.xml');

  if (!documentFile) {
    throw new Error('A Pandoc DOCX nem tartalmaz word/document.xml fájlt.');
  }

  const documentXml = documentFile.asText();

  const bodyMatch = documentXml.match(/<w:body[^>]*>(.*)<\/w:body>/s);

  if (!bodyMatch) {
    throw new Error('Nem sikerült kinyerni a Word body XML-t.');
  }

  let rawXml = bodyMatch[1];

  rawXml = rawXml.replace(/<w:sectPr[^>]*>.*?<\/w:sectPr>/gs, '');

  rawXml = polishWordXml(rawXml);

  return rawXml;
}

function getAttr(xmlNode, attrName) {
  const match = xmlNode.match(new RegExp(`${attrName}="([^"]+)"`));

  return match ? match[1] : null;
}

function getImageRelationships(pandocZip) {
  const relsFile = pandocZip.file('word/_rels/document.xml.rels');

  if (!relsFile) {
    return [];
  }

  const relsXml = relsFile.asText();

  return [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((match) => {
      const node = match[0];

      return {
        id: getAttr(node, 'Id'),
        type: getAttr(node, 'Type'),
        target: getAttr(node, 'Target'),
      };
    })
    .filter((rel) => rel.id && rel.type && rel.target && rel.type.includes('/image'));
}

function ensureDocumentRels(zip) {
  const relsPath = 'word/_rels/document.xml.rels';

  const relsFile = zip.file(relsPath);

  if (relsFile) {
    return relsFile.asText();
  }

  const emptyRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  zip.file(relsPath, emptyRels);

  return emptyRels;
}

function saveDocumentRels(zip, relsXml) {
  zip.file('word/_rels/document.xml.rels', relsXml);
}

function getNextRid(relsXml) {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1])).filter((n) => !Number.isNaN(n));

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function addRelationship(relsXml, id, type, target) {
  const relationship = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;

  return relsXml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function ensureContentType(zip, extension, contentType) {
  const contentTypesPath = '[Content_Types].xml';

  const file = zip.file(contentTypesPath);

  if (!file) {
    return;
  }

  let xml = file.asText();

  const ext = extension.replace('.', '').toLowerCase();

  if (xml.includes(`Extension="${ext}"`)) {
    return;
  }

  const defaultNode = `<Default Extension="${ext}" ContentType="${contentType}"/>`;

  xml = xml.replace('</Types>', `${defaultNode}</Types>`);

  zip.file(contentTypesPath, xml);
}

function getImageContentType(ext) {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';

    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';

    case '.gif':
      return 'image/gif';

    case '.bmp':
      return 'image/bmp';

    case '.svg':
      return 'image/svg+xml';

    case '.webp':
      return 'image/webp';

    default:
      return 'application/octet-stream';
  }
}

function injectPandocImagesIntoTemplate(rawXml, pandocZip, templateZip, uniquePrefix) {
  const imageRelationships = getImageRelationships(pandocZip);

  console.log(`>>> Pandoc által talált képek száma: ${imageRelationships.length}`);

  if (!imageRelationships.length) {
    return rawXml;
  }

  let templateRelsXml = ensureDocumentRels(templateZip);

  let nextRid = getNextRid(templateRelsXml);

  let updatedXml = rawXml;

  let copiedCount = 0;

  for (const rel of imageRelationships) {
    const oldRid = rel.id;

    const cleanTarget = rel.target.replace(/^\.?\//, '').replace(/^word\//, '');

    const sourceMediaPath = cleanTarget.startsWith('media/')
      ? `word/${cleanTarget}`
      : `word/media/${path.basename(cleanTarget)}`;

    const sourceMediaFile = pandocZip.file(sourceMediaPath);

    if (!sourceMediaFile) {
      console.warn(`[FIGYELEM] Kép nincs a Pandoc DOCX-ben: ${sourceMediaPath}`);

      continue;
    }

    const ext = path.extname(sourceMediaPath) || '.png';

    const newFileName = `${uniquePrefix}-${path.basename(sourceMediaPath)}`;

    const newTarget = `media/${newFileName}`;

    const newMediaPath = `word/${newTarget}`;

    const newRid = `rId${nextRid++}`;

    templateZip.file(newMediaPath, sourceMediaFile.asUint8Array());

    templateRelsXml = addRelationship(templateRelsXml, newRid, rel.type, newTarget);

    updatedXml = updatedXml.replaceAll(`r:embed="${oldRid}"`, `r:embed="${newRid}"`);

    updatedXml = updatedXml.replaceAll(`r:link="${oldRid}"`, `r:link="${newRid}"`);

    ensureContentType(templateZip, ext, getImageContentType(ext));

    copiedCount++;
  }

  saveDocumentRels(templateZip, templateRelsXml);

  console.log(`>>> Sablonba átmásolt képek száma: ${copiedCount}`);

  return updatedXml;
}

function mdxToWordXmlAndMedia(mdxContent, mdxPath, templateZip) {
  const pandocBuffer = createPandocDocx(mdxContent, mdxPath);

  const pandocZip = new PizZip(pandocBuffer);

  let rawXml = extractPandocBodyXml(pandocZip);

  const uniquePrefix = `${safeName(path.basename(mdxPath, path.extname(mdxPath)))}-${Date.now()}`;

  rawXml = injectPandocImagesIntoTemplate(rawXml, pandocZip, templateZip, uniquePrefix);

  return rawXml;
}

function forceAllTablesToTable1(zip) {
  const documentPath = 'word/document.xml';

  const documentFile = zip.file(documentPath);

  if (!documentFile) {
    return;
  }

  let xml = documentFile.asText();

  xml = xml.replace(/<w:tblStyle w:val="[^"]+"\s*\/>/g, '<w:tblStyle w:val="Table1"/>');

  xml = xml.replace(/<w:tblPr>(?![\s\S]*?<w:tblStyle)/g, '<w:tblPr><w:tblStyle w:val="Table1"/>');

  zip.file(documentPath, xml);
}

function normalizeBookmarksInDocument(zip) {
  const documentPath = 'word/document.xml';

  const documentFile = zip.file(documentPath);

  if (!documentFile) {
    return;
  }

  let xml = documentFile.asText();

  xml = xml.replace(
    /<w:bookmarkStart\s+w:id="([^"]+)"\s+w:name="([^"]+)"\s*\/>\s*(<w:p[\s\S]*?<\/w:p>)([\s\S]*?)<w:bookmarkEnd\s+w:id="\1"\s*\/>/g,
    (full, id, name, paragraph, middle) => {
      const fixedParagraph = paragraph
        .replace(/(<w:p[^>]*>)/, `$1<w:bookmarkStart w:id="${id}" w:name="${name}"/>`)
        .replace(/(<\/w:p>)/, `<w:bookmarkEnd w:id="${id}"/>$1`);

      return `${fixedParagraph}${middle}`;
    }
  );

  zip.file(documentPath, xml);
}

function removeAllBookmarks(zip) {
  const documentPath = 'word/document.xml';

  const documentFile = zip.file(documentPath);

  if (!documentFile) {
    return;
  }

  let xml = documentFile.asText();

  xml = xml.replace(/<w:bookmarkStart[\s\S]*?\/>/g, '');

  xml = xml.replace(/<w:bookmarkEnd[\s\S]*?\/>/g, '');

  zip.file(documentPath, xml);
}

function generateDocx(mdxPath, templatePath, outputPath) {
  const cleanedMdx = cleanMdx(mdxPath);

  const templateFile = fs.readFileSync(templatePath, 'binary');

  const templateZip = new PizZip(templateFile);

  const rawXml = mdxToWordXmlAndMedia(cleanedMdx, mdxPath, templateZip);

  const doc = new Docxtemplater(templateZip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({
    cim: getTitleFromMdx(cleanedMdx, mdxPath),
    alcim: getSubtitleFromMdx(cleanedMdx),
    roviditett: path.basename(mdxPath, path.extname(mdxPath)),
    date: getFormattedDate(),
    mdx_tartalom: rawXml,
  });

  // -------------------------------------------------
  // RENDER UTÁNI FIXEK
  // -------------------------------------------------

  forceAllTablesToTable1(doc.getZip());

  normalizeBookmarksInDocument(doc.getZip());

  removeAllBookmarks(doc.getZip());

  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  fs.writeFileSync(outputPath, buf);
}

function convertDocumentationFolder(inputDir, outputDir, templatePath) {
  console.log(`>>> Projekt gyökér: ${PROJECT_ROOT}`);

  console.log(`>>> Input mappa: ${inputDir}`);

  console.log(`>>> Output mappa: ${outputDir}`);

  console.log(`>>> Sablon: ${templatePath}`);

  if (fs.existsSync(REFERENCE_DOCX)) {
    console.log(`>>> Pandoc reference DOCX: ${REFERENCE_DOCX}`);
  } else {
    console.log('>>> FIGYELEM: reference.docx nem található, Pandoc alapstílusokat használ.');
  }

  if (!fs.existsSync(templatePath)) {
    console.error(`HIBA: A sablon nem található:\n${templatePath}`);

    return;
  }

  if (!fs.existsSync(inputDir)) {
    console.error(`HIBA: Az input mappa nem található:\n${inputDir}`);

    return;
  }

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);

    items.forEach((item) => {
      const fullPath = path.join(currentDir, item);

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
        return;
      }

      if (!stat.isFile()) {
        return;
      }

      const ext = path.extname(item).toLowerCase();

      if (ext !== '.mdx' && ext !== '.md') {
        return;
      }

      const relativePath = path.relative(inputDir, currentDir);

      const targetFolder = path.join(outputDir, relativePath);

      fs.mkdirSync(targetFolder, {
        recursive: true,
      });

      const fileNameWithoutExt = path.basename(item, ext);

      const outputPath = path.join(targetFolder, `${fileNameWithoutExt}.docx`);

      try {
        console.log(`\n>>> Konvertálás: ${path.join(relativePath, item)}`);

        generateDocx(fullPath, templatePath, outputPath);

        console.log(`[SIKERES] ${outputPath}`);
      } catch (err) {
        console.error(`[HIBA] ${path.join(relativePath, item)}`);

        console.error(err.message);
      }
    });
  }

  walk(inputDir);

  console.log('\n>>> Folyamat befejeződött!');

  console.log(`>>> DOCX fájlok: ${OUTPUT_DIR}`);
}

convertDocumentationFolder(INPUT_DIR, OUTPUT_DIR, TEMPLATE_PATH);

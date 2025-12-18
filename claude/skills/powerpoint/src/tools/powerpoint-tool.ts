import PptxGenJS from 'pptxgenjs';

interface TitleSlide {
  type: 'title';
  title: string;
  subtitle?: string;
}

interface ContentSlide {
  type: 'content';
  title: string;
  content: string[];
}

interface SectionSlide {
  type: 'section';
  title: string;
}

interface TwoColumnSlide {
  type: 'two-column';
  title: string;
  leftContent: string[];
  rightContent: string[];
  leftHeader?: string;
  rightHeader?: string;
}

interface ThreeBoxSlide {
  type: 'three-box';
  title: string;
  boxes: Array<{
    header: string;
    content: string[];
  }>;
}

interface ComparisonSlide {
  type: 'comparison';
  title: string;
  before: { header: string; content: string[] };
  after: { header: string; content: string[] };
}

interface DiagramSlide {
  type: 'diagram';
  title: string;
  centerBox: string;
  surroundingBoxes: string[];
}

type Slide = TitleSlide | ContentSlide | SectionSlide | TwoColumnSlide | ThreeBoxSlide | ComparisonSlide | DiagramSlide;

interface PresentationData {
  title: string;
  author?: string;
  slides: Slide[];
}

// Brand colors
const COLORS = {
  primary: '2563EB',      // Blue
  secondary: '10B981',    // Green
  accent: 'F59E0B',       // Amber
  dark: '1F2937',         // Dark gray
  light: 'F3F4F6',        // Light gray
  white: 'FFFFFF',
  red: 'EF4444',
  green: '10B981',
};

function createPresentation(data: PresentationData): PptxGenJS {
  const pptx = new PptxGenJS();

  pptx.author = data.author || 'Claude Code';
  pptx.title = data.title;
  pptx.subject = data.title;

  // Set default slide size (widescreen 16:9)
  pptx.defineLayout({ name: 'LAYOUT_WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'LAYOUT_WIDE';

  for (const slideData of data.slides) {
    const slide = pptx.addSlide();

    switch (slideData.type) {
      case 'title':
        createTitleSlide(slide, slideData);
        break;
      case 'content':
        createContentSlide(slide, slideData);
        break;
      case 'section':
        createSectionSlide(slide, slideData);
        break;
      case 'two-column':
        createTwoColumnSlide(slide, slideData);
        break;
      case 'three-box':
        createThreeBoxSlide(slide, slideData);
        break;
      case 'comparison':
        createComparisonSlide(slide, slideData);
        break;
      case 'diagram':
        createDiagramSlide(slide, slideData);
        break;
    }
  }

  return pptx;
}

function createTitleSlide(slide: PptxGenJS.Slide, data: TitleSlide): void {
  // Background
  slide.background = { color: COLORS.primary };

  // Title
  slide.addText(data.title, {
    x: 0.5,
    y: 2.5,
    w: 12.33,
    h: 1.5,
    fontSize: 44,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Subtitle
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.5,
      y: 4.2,
      w: 12.33,
      h: 0.8,
      fontSize: 24,
      fontFace: 'Arial',
      color: COLORS.white,
      align: 'center',
    });
  }
}

function createContentSlide(slide: PptxGenJS.Slide, data: ContentSlide): void {
  // Title bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 1.2,
    fill: { color: COLORS.primary },
  });

  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 12.33,
    h: 0.7,
    fontSize: 28,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
  });

  // Bullet points
  const bulletPoints = data.content.map(text => ({
    text,
    options: { bullet: { type: 'bullet' as const }, indentLevel: 0 },
  }));

  slide.addText(bulletPoints, {
    x: 0.7,
    y: 1.6,
    w: 12,
    h: 5.5,
    fontSize: 20,
    fontFace: 'Arial',
    color: COLORS.dark,
    valign: 'top',
    lineSpacingMultiple: 1.5,
  });
}

function createSectionSlide(slide: PptxGenJS.Slide, data: SectionSlide): void {
  slide.background = { color: COLORS.dark };

  slide.addText(data.title, {
    x: 0.5,
    y: 3,
    w: 12.33,
    h: 1.5,
    fontSize: 40,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });
}

function createTwoColumnSlide(slide: PptxGenJS.Slide, data: TwoColumnSlide): void {
  // Title bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 1.2,
    fill: { color: COLORS.primary },
  });

  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 12.33,
    h: 0.7,
    fontSize: 28,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
  });

  // Left column header
  if (data.leftHeader) {
    slide.addText(data.leftHeader, {
      x: 0.5,
      y: 1.5,
      w: 5.8,
      h: 0.5,
      fontSize: 20,
      fontFace: 'Arial',
      color: COLORS.primary,
      bold: true,
    });
  }

  // Left column content
  const leftBullets = data.leftContent.map(text => ({
    text,
    options: { bullet: { type: 'bullet' as const }, indentLevel: 0 },
  }));

  slide.addText(leftBullets, {
    x: 0.5,
    y: data.leftHeader ? 2.1 : 1.6,
    w: 5.8,
    h: 5,
    fontSize: 18,
    fontFace: 'Arial',
    color: COLORS.dark,
    valign: 'top',
    lineSpacingMultiple: 1.4,
  });

  // Right column header
  if (data.rightHeader) {
    slide.addText(data.rightHeader, {
      x: 7,
      y: 1.5,
      w: 5.8,
      h: 0.5,
      fontSize: 20,
      fontFace: 'Arial',
      color: COLORS.primary,
      bold: true,
    });
  }

  // Right column content
  const rightBullets = data.rightContent.map(text => ({
    text,
    options: { bullet: { type: 'bullet' as const }, indentLevel: 0 },
  }));

  slide.addText(rightBullets, {
    x: 7,
    y: data.rightHeader ? 2.1 : 1.6,
    w: 5.8,
    h: 5,
    fontSize: 18,
    fontFace: 'Arial',
    color: COLORS.dark,
    valign: 'top',
    lineSpacingMultiple: 1.4,
  });
}

function createThreeBoxSlide(slide: PptxGenJS.Slide, data: ThreeBoxSlide): void {
  // Title bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 1.2,
    fill: { color: COLORS.primary },
  });

  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 12.33,
    h: 0.7,
    fontSize: 28,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
  });

  // Three boxes
  const boxWidth = 3.8;
  const boxHeight = 5.2;
  const startX = 0.6;
  const gap = 0.4;

  data.boxes.forEach((box, index) => {
    const x = startX + (boxWidth + gap) * index;

    // Box background
    slide.addShape('rect', {
      x,
      y: 1.6,
      w: boxWidth,
      h: boxHeight,
      fill: { color: COLORS.light },
      line: { color: COLORS.primary, width: 2 },
    });

    // Box header
    slide.addText(box.header, {
      x,
      y: 1.8,
      w: boxWidth,
      h: 0.6,
      fontSize: 18,
      fontFace: 'Arial',
      color: COLORS.primary,
      bold: true,
      align: 'center',
    });

    // Box content
    const bullets = box.content.map(text => ({
      text,
      options: { bullet: { type: 'bullet' as const }, indentLevel: 0 },
    }));

    slide.addText(bullets, {
      x: x + 0.2,
      y: 2.5,
      w: boxWidth - 0.4,
      h: 4,
      fontSize: 14,
      fontFace: 'Arial',
      color: COLORS.dark,
      valign: 'top',
      lineSpacingMultiple: 1.3,
    });
  });
}

function createComparisonSlide(slide: PptxGenJS.Slide, data: ComparisonSlide): void {
  // Title bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 1.2,
    fill: { color: COLORS.primary },
  });

  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 12.33,
    h: 0.7,
    fontSize: 28,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
  });

  // Before box
  slide.addShape('rect', {
    x: 0.5,
    y: 1.5,
    w: 5.9,
    h: 5.5,
    fill: { color: 'FEE2E2' },
    line: { color: COLORS.red, width: 2 },
  });

  slide.addText(data.before.header, {
    x: 0.5,
    y: 1.7,
    w: 5.9,
    h: 0.6,
    fontSize: 20,
    fontFace: 'Arial',
    color: COLORS.red,
    bold: true,
    align: 'center',
  });

  const beforeBullets = data.before.content.map(text => ({
    text,
    options: { bullet: { code: '2717' }, indentLevel: 0 },
  }));

  slide.addText(beforeBullets, {
    x: 0.7,
    y: 2.4,
    w: 5.5,
    h: 4.3,
    fontSize: 16,
    fontFace: 'Arial',
    color: COLORS.dark,
    valign: 'top',
    lineSpacingMultiple: 1.4,
  });

  // After box
  slide.addShape('rect', {
    x: 6.9,
    y: 1.5,
    w: 5.9,
    h: 5.5,
    fill: { color: 'D1FAE5' },
    line: { color: COLORS.green, width: 2 },
  });

  slide.addText(data.after.header, {
    x: 6.9,
    y: 1.7,
    w: 5.9,
    h: 0.6,
    fontSize: 20,
    fontFace: 'Arial',
    color: COLORS.green,
    bold: true,
    align: 'center',
  });

  const afterBullets = data.after.content.map(text => ({
    text,
    options: { bullet: { code: '2713' }, indentLevel: 0 },
  }));

  slide.addText(afterBullets, {
    x: 7.1,
    y: 2.4,
    w: 5.5,
    h: 4.3,
    fontSize: 16,
    fontFace: 'Arial',
    color: COLORS.dark,
    valign: 'top',
    lineSpacingMultiple: 1.4,
  });
}

function createDiagramSlide(slide: PptxGenJS.Slide, data: DiagramSlide): void {
  // Title bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 1.2,
    fill: { color: COLORS.primary },
  });

  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 12.33,
    h: 0.7,
    fontSize: 28,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
  });

  // Center box (Coordinator)
  const centerX = 5.16;
  const centerY = 2.2;
  const centerW = 3;
  const centerH = 1.2;

  slide.addShape('rect', {
    x: centerX,
    y: centerY,
    w: centerW,
    h: centerH,
    fill: { color: COLORS.primary },
    line: { color: COLORS.dark, width: 1 },
  });

  slide.addText(data.centerBox, {
    x: centerX,
    y: centerY + 0.3,
    w: centerW,
    h: 0.6,
    fontSize: 16,
    fontFace: 'Arial',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Surrounding boxes
  const boxW = 2.2;
  const boxH = 1;
  const bottomY = 5;
  const numBoxes = data.surroundingBoxes.length;
  const totalWidth = numBoxes * boxW + (numBoxes - 1) * 0.3;
  const startX = (13.33 - totalWidth) / 2;

  data.surroundingBoxes.forEach((label, index) => {
    const x = startX + index * (boxW + 0.3);

    // Connecting line
    slide.addShape('line', {
      x: centerX + centerW / 2,
      y: centerY + centerH,
      w: x + boxW / 2 - (centerX + centerW / 2),
      h: bottomY - (centerY + centerH),
      line: { color: COLORS.dark, width: 1 },
    });

    // Box
    slide.addShape('rect', {
      x,
      y: bottomY,
      w: boxW,
      h: boxH,
      fill: { color: COLORS.secondary },
      line: { color: COLORS.dark, width: 1 },
    });

    slide.addText(label, {
      x,
      y: bottomY + 0.25,
      w: boxW,
      h: 0.5,
      fontSize: 12,
      fontFace: 'Arial',
      color: COLORS.white,
      bold: true,
      align: 'center',
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const outputPath = args[1];
  const jsonData = args[2];

  if (!command || !outputPath) {
    console.error('Usage: ts-node powerpoint-tool.ts <command> <output-path> [json-data]');
    console.error('Commands: create');
    process.exit(1);
  }

  if (command === 'create') {
    if (!jsonData) {
      console.error('JSON data required for create command');
      process.exit(1);
    }

    const data: PresentationData = JSON.parse(jsonData);
    const pptx = createPresentation(data);
    await pptx.writeFile({ fileName: outputPath });
    console.log(`Presentation created: ${outputPath}`);
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch(console.error);

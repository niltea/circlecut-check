// 外枠線の幅(px)
const outerBorderWidth = 24;
// 内枠線の幅(px)
const innerBorderWidth = 19;
// 左上枠の幅
const LTboxWidth = 198;
// 左上枠の高さ
const LTboxHeight = 198;

const cutPath = '/cut';

const fs = require('fs').promises;
const {loadImage, createCanvas} = require('@napi-rs/canvas');

const checkFrameColor = ([imageData, image], startX, startY, width, height) => {
  const endY = startY + height;
  const endX = startX + width;
  const checkArrayY = [];
  let resStr = '';
  let errorCount = 0;
  for (let y = startY; y < endY; y += 1) {
    const checkArrayX = [];
    const yOffset = y * image.width * 4;
    for (let x = startX; x < endX; x += 1) {
      const xOffset = x * 4;
      const R = imageData.data[yOffset + xOffset];
      const G = imageData.data[yOffset + xOffset + 1];
      const B = imageData.data[yOffset + xOffset + 2];
      const A = imageData.data[yOffset + xOffset + 3];
      const isBlack = (R < 16 && G < 16 && B < 16 && A === 255);
      if (!isBlack) {
        errorCount += 1;
        if (errorCount <= 8) {
          // console.log([x, y], [R, G, B, A])
          resStr += `x:${x}-y:${y}=(${R}-${G}-${B}-${A})\n`;
        }
      }
      checkArrayX.push(isBlack);
    }
    checkArrayY.push(checkArrayX.every(value => value === true))
  }
  return [checkArrayY.every(value => value === true), resStr, errorCount];
};
// 左上枠に記入がないか確認
const checkLTFrame = ([imageData, image]) => {
  const startX = outerBorderWidth;
  const startY = outerBorderWidth;
  const endY = startY + LTboxHeight;
  const endX = startX + LTboxWidth;
  const checkArrayY = [];
  let resStr = '';
  let errorCount = 0;
  for (let y = startY; y < endY; y += 1) {
    const checkArrayX = [];
    const yOffset = y * image.width * 4;
    for (let x = startX; x < endX; x += 1) {
      const xOffset = x * 4;
      const R = imageData.data[yOffset + xOffset];
      const G = imageData.data[yOffset + xOffset + 1];
      const B = imageData.data[yOffset + xOffset + 2];
      const A = imageData.data[yOffset + xOffset + 3];
      const isWhite = (R === 255 && G === 255 && B === 255 && A === 255);
      if (!isWhite) {
        errorCount += 1;
        if (errorCount <= 8) {
          // console.log([x, y], [R, G, B, A])
          resStr += `x:${x}-y:${y}=(${R}-${G}-${B}-${A})\n`;
        }
      }
      checkArrayX.push(isWhite);
    }
    checkArrayY.push(checkArrayX.every(value => value === true))
  }
  return [checkArrayY.every(value => value === true), resStr, errorCount];
};

async function checkFrame(fileName) {
  // ファイル読み込み
  const image = await loadImage(fileName);

  // canvasを作成
  const canvas = createCanvas(image.width, image.height);
  // context取得
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  const imageArray = [];
  const checkImageData = [imageData, image];
  // 上枠線を調べる
  const upper = checkFrameColor(checkImageData, 0, 0, image.width, outerBorderWidth);
  // console.log(`upper: ${upper}`);
  // 下枠線を調べる
  const lower = checkFrameColor(checkImageData, 0, image.height - outerBorderWidth, image.width, outerBorderWidth);
  // console.log(`lower: ${lower}`);
  // 左枠線を調べる
  const left = checkFrameColor(checkImageData, 0, outerBorderWidth, outerBorderWidth, image.height - (outerBorderWidth * 2));
  // console.log(`left: ${left}`);
  // 右枠線を調べる
  const right = checkFrameColor(checkImageData, (image.width - outerBorderWidth), outerBorderWidth, outerBorderWidth, image.height - (outerBorderWidth * 2));
  // console.log(`right: ${right}`);
  // 内側下枠線を調べる
  const innerLower = checkFrameColor(checkImageData, outerBorderWidth, outerBorderWidth + LTboxHeight, LTboxWidth + innerBorderWidth, innerBorderWidth);
  // console.log(`innerLower: ${innerLower}`);
  // 内側下枠線を調べる
  const innerRight = checkFrameColor(checkImageData, outerBorderWidth + LTboxWidth, outerBorderWidth, innerBorderWidth, LTboxHeight);
  // console.log(`innerRight: ${innerRight}`);

  const isFrameOK = [upper[0], lower[0], left[0], right[0], innerLower[0], innerRight[0]].every(value => value === true)
  const frameErrPixels = upper[1] + lower[1] + left[1] + right[1] + innerLower[1] + innerRight[1];
  const frameErrCount = upper[2] + lower[2] + left[2] + right[2] + innerLower[2] + innerRight[2];
  // console.log(`isFrameOK: ${isFrameOK}`);

  const LTFrameResult = checkLTFrame(checkImageData);
  return {
      isFrameOK,
      isLTOK: LTFrameResult[0],
      frameErrPixels,
      frameErrCount,
      LTFrameErrPixels: LTFrameResult[1],
      LTFrameErrCount: LTFrameResult[2]
  };
}
async function main() {
  // '/cut/1sp-frame.png'
  const regex = /\.(jpg|png)/;
  const path = __dirname + cutPath;
  const dir = await fs.readdir(path);
  const files = dir.filter(file => file.match(regex));

  const result = await Promise.all(files.map(async (file) => {
    const checkResult = await checkFrame(path + '/' + file);
    return `${file},${checkResult.isFrameOK},${checkResult.isLTOK},"${checkResult.frameErrPixels}",${checkResult.frameErrCount},"${checkResult.LTFrameErrPixels}",${checkResult.LTFrameErrCount}`;
  }));
  const header = 'fileName,isFrameOK,isInnerFrameOK,NGPixel(outer),NGCount(outer),NGPixel(inner),NGCount(inner)\n';
  console.log(header + result.join('\n'));
  fs.writeFile( "result.csv" , header + result.join('\n') )
}
main();

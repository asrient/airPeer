function parse(buffer) {
  const firstByte = buffer.readUInt8(0);
  const isFinalFrame = Boolean(firstByte);
  if (!isFinalFrame) {
    console.log("Data frame is not the final frame");
  }
  const key = buffer.slice(1, 9);
  const buff = buffer.slice(9);
  return { data: buff, key, fin: isFinalFrame };
}

const frameSize=65535;

function build(fin, key, data) {
  var firstByte = Buffer.alloc(1);
  firstByte.fill(1);
  if (!fin) {
    firstByte.fill(0);
  }
  var keyBytes = Buffer.from(key);
  if (keyBytes.length != 8) {
    console.error("Key not 8 bytes", keyBytes.length);
  }
  const buff = Buffer.concat([firstByte, keyBytes, data]);
  if (buff.length > frameSize) {
    console.error("Cannot build frame. Buffer size should be < 64KB, current size: " + buff.length / 1024 + " KB");
    return null
  }
  else
    return buff
}

module.exports = { parse, build };
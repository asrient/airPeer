const frameSize = 65535;

function parseChunk(buffer) {
  if (buffer.length >= 11) {
    //Now we are sure all the headers are there
    const firstByte = buffer.readUInt8(0);
    const isFinalFrame = Boolean(firstByte);
    const key = buffer.slice(1, 9);
    const size = buffer.readUInt16BE(9);
    if (buffer.length >= size + 11) {
      //To make sure full payload exists
      const buff = buffer.slice(11, 11 + size);
      var remaining = null;
      if (buffer.length > size + 11) {
        remaining = buffer.slice(11 + size);
      }
      return { chunk: { data: buff, key, size, fin: isFinalFrame }, remaining };
    }
    else return { chunk: null, remaining: buffer }
  }
  else return { chunk: null, remaining: buffer }
}

function parse(buffer) {
  var remaining = buffer;
  var chunks = [];
  var done = false;
  while (remaining != null && !done) {
    var res = parseChunk(remaining);
    if (res.chunk != null) {
      chunks.push(res.chunk);
    }
    else {
      done = true;
    }
    remaining = res.remaining;
  }
  return { chunks, roaming: remaining }
}

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
  const size = Buffer.allocUnsafe(2);
  size.writeUInt16BE(data.length);
  const buff = Buffer.concat([firstByte, keyBytes, size, data]);
  if (buff.length > frameSize) {
    console.error("Cannot build frame. Buffer size should be < 64KB, current size: " + buff.length / 1024 + " KB");
    return null
  }
  else
    return buff
}

module.exports = { parse, build };
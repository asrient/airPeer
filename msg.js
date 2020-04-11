const version = '1.0';
const seperator = "\r\n\r\n";
const sepLen = Buffer.byteLength(seperator);
const types = ['connect', 'connected', 'request', 'response'];

function buildMessage(obj) {
  var sep = "\r\n";
  var msg = "";
  if (obj.type != undefined) {
    msg += obj.type + " AIR/" + version + sep;
    if (obj.type == 'connect' && obj.uid != undefined) {
      msg += "uid=" + obj.uid + sep;
    }
    if (obj.type == 'connect' && obj.host != undefined) {
      msg += "host=" + obj.host + sep;
    }
    if (obj.type == 'connect' && obj.name != undefined) {
      msg += "name=" + obj.name + sep;
    }
    if (obj.type == 'connect' && obj.icon != undefined) {
      msg += "icon=" + obj.icon + sep;
    }
    if (obj.type == 'connect' && obj.app != undefined) {
      msg += "app=" + obj.app + sep;
    }
    if (obj.type == 'connected' && obj.airid != undefined) {
      msg += "airid=" + obj.airid + sep;
    }
    if (obj.type == 'request' || obj.type == 'response') {
      if (obj.key != undefined) {
        msg += "key=" + obj.key + sep;
      }
      if (obj.to != undefined) {
        msg += "to=" + obj.to + sep;
      }
      if (obj.from != undefined) {
        msg += "from=" + obj.from + sep;
      }
      if (obj.type == 'response' && obj.status != undefined) {
        msg += "status=" + obj.status + sep;
      }
    }
  }
  msg += sep;
  var buff = Buffer.from(msg);
  if (obj.body != undefined) {
    if (!Buffer.isBuffer(obj.body)) {
      obj.body = Buffer.from(obj.body);
    }
    return Buffer.concat([buff, obj.body])
  }
  else
    return buff;
}

function parseMessage(msg) {
  var data = {};
  var buff = Buffer.from(msg);
  var offset = buff.indexOf(seperator);
  var body = buff.slice(offset + sepLen);
  var head = buff.slice(0, offset).toString();
  var opts = head.split("\r\n");
  data.body = body;
  opts.forEach((opt, ind) => {
    if (ind == 0) {
      var type = opt.split(' ')[0];
      var protocol = opt.split(' ')[1];
      if (type != undefined && protocol != undefined) {
        if (protocol == 'AIR/' + version) {
          type = type.toLowerCase();
          if (types.includes(type)) {
            data.type = type;
            data.version = version;
          }
        }
      }
    }
    else {
      var key = opt.split('=')[0];
      var val = opt.split('=')[1];
      if (key != undefined && val != undefined) {
        key = key.toLowerCase();
        key = key.trim();
        val = val.trim();
        if (key != undefined && val != undefined) {
          if (data.type != undefined) {
            if ((key == 'name' || key == 'app' || key == 'icon') && data.type == 'connect') {
              data[key] = val;
            }
            if (key == 'uid' && data.type == 'connect') {
              data[key] = val;
            }
            if (key == 'host' && data.type == 'connect') {
              data[key] = val;
            }
            else if (key == 'airid' && data.type == 'connected') {
              data[key] = val;
            }
            else if (data.type == 'request' || data.type == 'response') {
              if (key == 'key') {
                data[key] = val;
              }
              else if (key == 'to') {
                data[key] = val;
              }
              else if (key == 'from') {
                data[key] = val;
              }
              else if (data.type == 'response' && key == 'status') {
                data[key] = parseInt(val);
              }
            }
          }
        }
      }
    }
  })
  return data;
}

module.exports = { parse: parseMessage, build: buildMessage }
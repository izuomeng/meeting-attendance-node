const shell = require('shelljs')
const crypto = require('crypto')
const url = require('url')
const axios = require('axios')
const fs = require('fs')
const moment = require('moment')
const sharp = require('sharp')

const AK_ID = 'LTAIBw2Bq6CTrLa1'
const AK_SECRET = 'vEsqDg0ja0GPoUjTzUcMHBj7AoHCv7'
const CONFIDENCE = 50

exports.faceCompare = async (ws, list, req) => {
  const screenshot = await screenShot()
  if (!screenshot || !screenshot.url) {
    throw new Error('Get screenshot url failed')
  }
  for (const item of list) {
    if (!item.face) {
      return
    }
    const config = getFaceCompareReq({
      type: 0,
      image_url_1: screenshot.url,
      image_url_2: item.face
    })
    axios(config)
      .then(async ({ data }) => {
        if (data.errno !== 0) {
          throw new Error(data.err_msg)
        }

        const { confidence, rectA } = data
        // 成功识别到人脸
        if (confidence > CONFIDENCE) {
          // 把拍到的人脸区域挖出来，传到服务器上
          const imageAfterCut = await cutImg(screenshot.buffer, {
            left: rectA[0],
            top: rectA[1],
            width: rectA[2],
            height: rectA[3]
          })
          const { url: takenUrl } = await uploadImg('cut.jpg', 'image/jpeg', imageAfterCut)
          // 更新后端数据
          const { data: updateResponse } = await axios({
            method: 'PUT',
            url: `http://localhost:8888/api/meeting/sign`,
            data: `id=${item.id}&attendance=1&time=${moment().format(
              'YYYY-MM-DD HH:mm:ss'
            )}&image=${takenUrl}`,
            headers: { 'content-type': 'application/x-www-form-urlencoded' }
          })

          if (updateResponse.status === 0) {
            // TODO: need refactoring
            ws.send(JSON.stringify({ type: 1 })) // 告诉浏览器重新拉取数据
          }
        }
      })
      .catch(error => console.log(error))
  }
}

function getFaceCompareReq(body) {
  // 这里填写AK和请求
  const options = {
    url: 'https://dtplus-cn-shanghai.data.aliyuncs.com/face/verify',
    method: 'POST',
    data: body,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      date: new Date().toUTCString(),
      Authorization: ''
    }
  }
  const md5 = buffer => {
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    return hash.digest('base64')
  }

  const sha1 = (stringToSign, secret) =>
    crypto
      .createHmac('sha1', secret)
      .update(stringToSign)
      .digest()
      .toString('base64')

  // step1: 组stringToSign [StringToSign = #{method}\\n#{accept}\\n#{data}\\n#{contentType}\\n#{date}\\n#{action}]
  const bodymd5 = body ? md5(new Buffer(JSON.stringify(body))) : body

  const stringToSign = `${options.method}\n${options.headers.accept}\n${bodymd5}\n${
    options.headers['content-type']
  }\n${options.headers.date}\n${url.parse(options.url).path}`

  // step2: 加密 [Signature = Base64( HMAC-SHA1( AccessSecret, UTF-8-Encoding-Of(StringToSign) ) )]
  const signature = sha1(stringToSign, AK_SECRET)

  // step3: 组authorization header [Authorization =  Dataplus AccessKeyId + ":" + Signature]
  const authHeader = `Dataplus ${AK_ID}:${signature}`

  options.headers.Authorization = authHeader

  return options
}

function screenShot() {
  const filename = `${Date.now()}.jpg`
  const result = shell.exec(
    `ffmpeg -probesize 36 -i "rtmp://www.i-zuomeng.com/live/cyf live=1" -y -t 1 -ss 1 -f image2 -vframes 1 screenshots/${filename}`
  )
  if (result.code !== 0) {
    throw new Error(`Screenshot failed: ${result}`)
  }
  return new Promise((resolve, reject) => {
    const path = `./screenshots/${filename}`
    fs.readFile(path, (error, buffer) => {
      if (error) {
        reject(error)
      }
      // 删除截图文件
      fs.unlink(path, err => {
        if (err) {
          console.log('delete screenshot fialed')
        }
      })
      uploadImg(filename, 'image/jpeg', buffer)
        .then(data => resolve({ url: data.url, buffer }))
        .catch(error => reject(error))
    })
  })
}

function uploadImg(name, type = 'image/jpeg', buffer) {
  return axios
    .post('http://wd.gtays.cn/ugc/pet_blind_date/invoke/img_upload', {
      files: {
        image: { name, type, buffer }
      }
    })
    .then(res => res.data)
}

function cutImg(buffer, option) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('first arg must be buffer')
  }
  const { left, top, width, height } = option
  return sharp(buffer)
    .extract({ left, top, width, height })
    .toBuffer()
}

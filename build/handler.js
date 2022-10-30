"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhotos = exports.uploadPhoto = void 0;
const sharp_1 = __importDefault(require("sharp"));
const aws_sdk_1 = require("aws-sdk");
const parse_multipart_1 = __importDefault(require("parse-multipart"));
const mongoose_1 = __importDefault(require("mongoose"));
const photos_1 = require("./models/photos");
const BUCKET = process.env.S3_BUCKET;
const s3 = new aws_sdk_1.S3();
const uploadPhoto = (event) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO URI is required');
    }
    try {
        const { filename, data } = extractFile(event);
        yield mongoose_1.default.connect(process.env.MONGO_URI);
        console.log('event::', event.requestContext);
        if (event.body === null) {
            throw new Error('image is required');
        }
        console.log(filename, data);
        console.log(BUCKET);
        let image = (0, sharp_1.default)(data);
        const metadata = yield image.metadata();
        if (event.requestContext.authorizer && metadata.width) {
            const userId = (_a = event === null || event === void 0 ? void 0 : event.requestContext) === null || _a === void 0 ? void 0 : _a.authorizer.claims.sub;
            yield Promise.all([
                image
                    .resize(metadata.width > 400 ? 400 : metadata.width)
                    .webp()
                    .toBuffer()
                    .then((outputBuffer) => {
                    //console.log("inside resize");
                    return s3
                        .putObject({
                        Key: `${userId}/thumbnails/${filename}.webp`,
                        Bucket: BUCKET,
                        Body: outputBuffer,
                    })
                        .promise();
                }),
                image
                    .resize(metadata.width > 1080 ? 1080 : metadata.width)
                    .webp()
                    .toBuffer()
                    .then((outputBuffer) => {
                    //console.log("inside resize");
                    return s3
                        .putObject({
                        Key: `${userId}/webview/${filename}.webp`,
                        Bucket: BUCKET,
                        Body: outputBuffer,
                    })
                        .promise();
                }),
                yield s3
                    .putObject({
                    Key: `${userId}/original/${filename}`,
                    Bucket: BUCKET,
                    Body: data,
                })
                    .promise(),
            ]);
            const photo = photos_1.Photo.build({
                userId,
                thumbnail: `${userId}/thumbnails/${filename}.webp`,
                webView: `${userId}/webview/${filename}.webp`,
                original: `${userId}/original/${filename}`,
                name: filename,
                timestamp: new Date(Date.now()),
            });
            yield photo.save();
            return {
                statusCode: 200,
                body: JSON.stringify({
                    photo,
                }),
            };
        }
    }
    catch (err) {
        console.log(`Error::${err}`);
        return {
            statusCode: 500,
            body: event,
        };
    }
});
exports.uploadPhoto = uploadPhoto;
function getPhotos() {
    return __awaiter(this, void 0, void 0, function* () {
        var bucketParams = {
            Bucket: BUCKET,
        };
        try {
            // Call S3 to obtain a list of the objects in the bucket
            let response = yield s3.listObjects(bucketParams).promise();
            console.log(response);
            if (response && response.Contents) {
                const url = s3.getSignedUrl('getObject', {
                    Bucket: BUCKET,
                    Key: response.Contents[0].Key,
                    Expires: 3 * 60,
                });
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        url,
                    }),
                };
            }
        }
        catch (err) {
            console.log('Error', err);
        }
    });
}
exports.getPhotos = getPhotos;
function extractFile(event) {
    console.log(event);
    const boundary = parse_multipart_1.default.getBoundary(event.headers['Content-Type']);
    console.log(`eventBody::${event.body}`);
    console.log(`boundary::${boundary}`);
    const parts = parse_multipart_1.default.Parse(Buffer.from(event.body, 'base64'), boundary);
    const [{ filename, data }] = parts;
    return {
        filename,
        data,
    };
}

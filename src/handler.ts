import sharp from 'sharp';
import { S3 } from 'aws-sdk';
import { APIGatewayEvent } from 'aws-lambda';
import parseMultipart from 'parse-multipart';
import mongoose from 'mongoose';
import { Photo } from './models/photos';

const BUCKET = process.env.S3_BUCKET;

const s3 = new S3();

export const uploadPhoto = async (event: APIGatewayEvent) => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO URI is required');
  }

  try {
    const { filename, data } = extractFile(event);
    await mongoose.connect(process.env.MONGO_URI);

    console.log('event::', event.requestContext);

    if (event.body === null) {
      throw new Error('image is required');
    }

    console.log(filename, data);
    console.log(BUCKET);

    let image = sharp(data);
    const metadata = await image.metadata();

    if (event.requestContext.authorizer && metadata.width) {
      const userId = event?.requestContext?.authorizer.claims.sub;

      await Promise.all([
        image
          .resize(metadata.width > 400 ? 400 : metadata.width)
          .webp()
          .toBuffer()
          .then((outputBuffer) => {
            //console.log("inside resize");

            return s3
              .putObject({
                Key: `${userId}/thumbnails/${filename}.webp`,
                Bucket: BUCKET!,
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
                Bucket: BUCKET!,
                Body: outputBuffer,
              })
              .promise();
          }),

        await s3
          .putObject({
            Key: `${userId}/original/${filename}`,
            Bucket: BUCKET!,
            Body: data,
          })
          .promise(),
      ]);

      const photo = Photo.build({
        userId,
        thumbnail: `${userId}/thumbnails/${filename}.webp`,
        webView: `${userId}/webview/${filename}.webp`,
        original: `${userId}/original/${filename}`,
        name: filename,
        timestamp: new Date(Date.now()),
      });

      await photo.save();

      return {
        statusCode: 200,
        body: JSON.stringify({
          photo,
        }),
      };
    }
  } catch (err) {
    console.log(`Error::${err}`);
    return {
      statusCode: 500,
      body: event,
    };
  }
};

export async function getPhotos() {
  var bucketParams = {
    Bucket: BUCKET!,
  };

  try {
    // Call S3 to obtain a list of the objects in the bucket
    let response = await s3.listObjects(bucketParams).promise();
    console.log(response);

    if (response && response.Contents) {
      const url = s3.getSignedUrl('getObject', {
        Bucket: BUCKET!,
        Key: response!.Contents[0]!.Key,
        Expires: 3 * 60,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          url,
        }),
      };
    }
  } catch (err) {
    console.log('Error', err);
  }
}

function extractFile(event: any) {
  console.log(event);
  const boundary = parseMultipart.getBoundary(event.headers['Content-Type']);
  console.log(`eventBody::${event.body}`);
  console.log(`boundary::${boundary}`);
  const parts = parseMultipart.Parse(
    Buffer.from(event.body, 'base64'),
    boundary
  );
  const [{ filename, data }] = parts;

  return {
    filename,
    data,
  };
}

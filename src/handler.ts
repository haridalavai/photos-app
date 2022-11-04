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
    const parts = extractFile(event);
    await mongoose.connect(process.env.MONGO_URI);

    console.log('event::', event.requestContext);

    if (event.body === null) {
      throw new Error('image is required');
    }

    const result = [];

    console.log(BUCKET);

    for (let i = 0; i < parts.length; i++) {
      const { data } = parts[i];
      const filename = new Date(Date.now()).toISOString();
      const image = sharp(data);
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
              Key: `${userId}/original/${filename}.png`,
              Bucket: BUCKET!,
              Body: data,
            })
            .promise(),
        ]);

        const photo = Photo.build({
          userId,
          thumbnail: `${userId}/thumbnails/${filename}.webp`,
          webView: `${userId}/webview/${filename}.webp`,
          original: `${userId}/original/${filename}.png`,
          name: filename,
          timestamp: new Date(Date.now()),
        });

        await photo.save();

        result.push(photo);
      }
    }
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
      body: JSON.stringify({
        result,
      }),
    };
  } catch (err) {
    console.log(`Error::${err}`);
    return {
      statusCode: 500,
      body: event,
    };
  }
};

export async function getPhotos() {
  const bucketParams = {
    Bucket: BUCKET!,
  };

  try {
    // Call S3 to obtain a list of the objects in the bucket
    const response = await s3.listObjects(bucketParams).promise();
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

// function to fetch thumbnails from mongo, create presigned url and return to client
export async function getThumbnails(event: APIGatewayEvent) {
  console.log('event::', event);
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO URI is required');
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);

    if (event.requestContext.authorizer) {
      //     // get user id from event
      const page = Number(event.queryStringParameters?.page) || 1;
      const limit = Number(event.queryStringParameters?.limit) || 10;
      const userId = event?.requestContext?.authorizer?.claims.sub;

      // if (
      //   event.queryStringParameters &&
      //   event.queryStringParameters.page &&
      //   event.queryStringParameters.limit
      // ) {
      //   page = parseInt(event.queryStringParameters?.page);
      //   limit = parseInt(event.queryStringParameters?.limit);
      // }
      const photos = await Photo.find({ userId })
        .skip((page - 1) * limit)
        .limit(limit);

      console.log('photos::', photos);

      const thumbnails = photos.map((photo) => {
        return {
          name: photo.name,
          thumbnail: s3.getSignedUrl('getObject', {
            Bucket: BUCKET!,
            Key: photo.thumbnail,
            Expires: 3 * 60,
          }),
          webView: s3.getSignedUrl('getObject', {
            Bucket: BUCKET!,
            Key: photo.webView,
            Expires: 3 * 60,
          }),
          original: s3.getSignedUrl('getObject', {
            Bucket: BUCKET!,
            Key: photo.original,
            Expires: 3 * 60,
          }),
        };
      });

      console.log('thumbnails::', thumbnails);
      const count = await Photo.countDocuments({ userId });

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify({
          page,
          limit,
          totalCount: count,
          thumbnails,
        }),
        isBase64Encoded: false,
      };
    }
  } catch (err) {
    console.log(`Error::${err}`);
    return {
      statusCode: 500,
      body: event,
    };
  }
}

function extractFile(event: any) {
  console.log(event);
  const boundary = parseMultipart.getBoundary(event.headers['content-type']);
  console.log(`eventBody::${event.body}`);
  console.log(`boundary::${boundary}`);
  const parts = parseMultipart.Parse(
    Buffer.from(event.body, 'base64'),
    boundary
  );
  console.log('parts::', parts.length);
  return parts;
}

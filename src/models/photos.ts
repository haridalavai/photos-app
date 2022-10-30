import mongoose from 'mongoose';

interface PhotoAttrs {
  userId: string;
  name: string;
  timestamp: Date;
  original: string;
  thumbnail: string;
  webView: string;
}

interface PhotoDoc extends mongoose.Document {
  userId: string;
  name: string;
  timestamp: Date;
  original: string;
  thumbnail: string;
  webView: string;
}

interface PhotoModel extends mongoose.Model<PhotoDoc> {
  build(attrs: PhotoAttrs): PhotoDoc;
}

const photoSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    original: {
      type: String,
      required: true,
    },
    thumbnail: {
      type: String,
      required: true,
    },
    webView: {
      type: String,
      required: true,
    },
  },
  {
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

photoSchema.statics.build = (attrs: PhotoAttrs) => {
  return new Photo(attrs);
};

const Photo = mongoose.model<PhotoDoc, PhotoModel>('Photo', photoSchema);

export { Photo };

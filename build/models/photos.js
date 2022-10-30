"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Photo = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const photoSchema = new mongoose_1.default.Schema({
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
}, {
    toJSON: {
        transform(doc, ret) {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
        },
    },
});
photoSchema.statics.build = (attrs) => {
    return new Photo(attrs);
};
const Photo = mongoose_1.default.model('Photo', photoSchema);
exports.Photo = Photo;

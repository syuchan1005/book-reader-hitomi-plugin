const fs = require('fs').promises;

const gql = require('graphql-tag');
const axios = require('axios').default;
const uuidv4 = require('uuid').v4;
const rimraf = require('rimraf');

const hitomi0 = require('./hitomi_0');
const hitomi = require('./hitomi');
const util = require('./util');

// noinspection JSUnusedGlobalSymbols
const plugin = {
  typeDefs: gql`type Mutation {
      addHitomi(id: ID! number: String! url: String!): Result!
  }`,
  middleware: {
    Mutation: ({ BookModel, BookInfoModel, sequelize }, { pubsub, util: { saveImage } }, keys) => ({
      addHitomi: async (parent, { id, number, url: argUrl }) => {
        /* BookInfo check */
        const bookInfo = await BookInfoModel.findOne({
          where: { id },
        });
        if (!bookInfo) {
          return {
            success: false,
            message: 'info not found',
          };
        }

        /* extract id */
        const numbers = argUrl.match(/\d+/g);
        if (numbers.length === 0) {
          return {
            success: false,
            message: 'hitomi\'s id not found',
          };
        }
        const galleryId = numbers[numbers.length - 1];

        /* get gallery info */
        await pubsub.publish(keys.ADD_BOOKS, {
          id,
          addBooks: 'Download Image Info',
        });
        let newGallery = false;
        let gallery = { files: [] };
        try {
          const galleryInfo = await axios.get(`https://ltn.hitomi.la/galleries/${galleryId}.js`)
            .then(({ data }) => data);
          // eslint-disable-next-line no-eval
          eval(galleryInfo.replace('var galleryinfo', 'gallery'));
          if (!Array.isArray(gallery) && gallery.files) {
            gallery = gallery.files;
            newGallery = true;
          }
        } catch (e) {
          return {
            success: false,
            message: 'page hashes not found',
          };
        }
        if (!Array.isArray(gallery)) {
          return {
            success: false,
            message: 'gallery data is not valid',
          };
        }
        const imageUrls = gallery.map(
          (image) => (newGallery ? hitomi : hitomi0).urlFromUrlFromHash(galleryId, image),
        );
        const pad = imageUrls.length.toString(10).length;

        /* write files */
        const bookId = uuidv4();
        const tempDir = `storage/book/${bookId}`;
        const catchFunc = (err) => new Promise((resolve, reject) => {
          rimraf(tempDir, () => {
            reject(err);
          });
        });
        await fs.mkdir(tempDir);
        const totalStr = imageUrls.length.toString().padStart(pad, '0');
        await util.asyncForEach(imageUrls, async (url, i) => {
          const filePath = `${tempDir}/${i.toString().padStart(pad, '0')}.jpg`;
          await pubsub.publish(keys.ADD_BOOKS, {
            id,
            addBooks: `Download Image ${i.toString().padStart(pad, '0')}/${totalStr}`,
          });
          const imageBuf = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36',
              referer: `https://hitomi.la/reader/${galleryId}.html`,
            },
          }).then(({ data }) => Buffer.from(data, 'binary'));
          await saveImage(filePath, imageBuf);
        }).catch(catchFunc);

        /* write database */
        await pubsub.publish(keys.ADD_BOOKS, {
          id,
          addBooks: 'Write Database',
        });
        const bThumbnail = `/book/${bookId}/${'0'.padStart(pad, '0')}.jpg`;
        await sequelize.transaction(async (transaction) => {
          await BookModel.create({
            id: bookId,
            thumbnail: bThumbnail,
            number,
            pages: imageUrls.length,
            infoId: id,
          }, {
            transaction,
          });
          await BookInfoModel.update({
            // @ts-ignore
            count: sequelize.literal('count + 1'),
          }, {
            where: {
              id,
            },
            transaction,
          });
          await BookInfoModel.update({
            history: false,
            count: 1,
          }, {
            where: {
              id,
              history: true,
            },
            transaction,
          });
          await BookInfoModel.update({
            thumbnail: bThumbnail,
          }, {
            where: {
              id,
              thumbnail: null,
            },
            transaction,
          });
        }).catch(catchFunc);

        return { success: true };
      },
    }),
  },
};

module.exports = plugin;

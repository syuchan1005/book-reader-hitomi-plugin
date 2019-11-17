const fs = require('fs').promises;

const gql = require('graphql-tag');
const axios = require('axios').default;
const uuidv4 = require('uuid/v4');

const hitomi = require('./hitomi');
const util = require('./util');

const plugin = {
  typeDefs: gql`type Mutation {
      addHitomi(id: ID! number: String! url: String!): Result!
  }`,
  middleware: {
    Mutation: ({
      BookModel,
      BookInfoModel,
      sequelize,
    }, {
      gm,
      pubsub,
    }, keys) => ({
      addHitomi: async (parent, { id, number, url }) => {
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
        const numbers = url.match(/\d+/g);
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
        let gallery = [];
        try {
          const galleryInfo = await axios.get(`https://ltn.hitomi.la/galleries/${galleryId}.js`)
            .then(({ data }) => data);
          eval(galleryInfo.replace('var galleryinfo', 'gallery'));
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
        const imageUrls = gallery.map((image) => `https:${hitomi.urlFromUrlFromHash(galleryId, image)}`);
        const pad = imageUrls.length.toString(10).length;

        /* write files */
        const bookId = uuidv4();
        const tempDir = `storage/book/${bookId}`;
        await fs.mkdir(tempDir);
        await util.asyncForEach(imageUrls, async (url, i) => {
          const filePath = `${tempDir}/${i.toString().padStart(pad, '0')}.jpg`;
          await pubsub.publish(keys.ADD_BOOKS, {
            id,
            addBooks: `Download Image ${i.toString().padStart(pad, '0')}`,
          });
          const imageBuf = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36',
              'referer': `https://hitomi.la/reader/${galleryId}.html`
            },
          }).then(({ data }) => Buffer.from(data, 'binary'));
          await pubsub.publish(keys.ADD_BOOKS, {
            id,
            addBooks: `Write Image ${i.toString().padStart(pad, '0')}`,
          });
          if (/\.jpe?g$/.test(url)) {
            await fs.writeFile(filePath, imageBuf);
          } else {
            await (new Promise((resolve) => {
              gm(imageBuf)
                .quality(85)
                .write(filePath, resolve);
            }));
          }
        });

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
        });

        return { success: true };
      },
    }),
  },
};

module.exports = plugin;

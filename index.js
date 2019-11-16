const fs = require('fs').promises;

const gql = require('graphql-tag');
const axios = require('axios').default;
const uuidv4 = require('uuid/v4');

const hitomi = require('./hitomi');
const util = require('./util');

const plugin = {
  db: undefined,
  typeDefs: gql`type Mutation {
      addHitomi(id: ID! number: String! url: String!): Result!
  }`,
  init(db) {
    plugin.db = db;
  },
  middleware: {
    Mutation: () => ({
      addHitomi: async (parent, { id, number, url }) => {
        /* BookInfo check */
        const bookInfo = await plugin.db.BookInfoModel.findOne({
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
        const imageUrls = gallery.map((image) => `https://${hitomi.urlFromUrlFromHash(galleryId, image)}`);
        const pad = imageUrls.length.toString(10).length;

        /* write files */
        const bookId = uuidv4();
        const tempDir = `storage/book/${bookId}`;
        await util.asyncForEach(imageUrls, async (url, i) => {
          const filePath = `${tempDir}/${i.toString().padStart(pad, '0')}.jpg`;
          const imageBuf = await axios.get(url, {
            responseType: 'arraybuffer',
          }).then(({ data }) => Buffer.from(data, 'binary'));
          if (/\.jpe?g$/.test(url)) {
            await fs.writeFile(filePath, imageBuf);
          } else {
            await (new Promise((resolve) => {
              this.gm(imageBuf)
                .quality(85)
                .write(filePath, resolve);
            }));
          }
        });

        /* write database */
        const bThumbnail = `/book/${bookId}/${'0'.padStart(pad, '0')}.jpg`;
        await plugin.db.sequelize.transaction(async (transaction) => {
          await plugin.db.BookModel.create({
            id: bookId,
            thumbnail: bThumbnail,
            number,
            pages: imageUrls.length,
            infoId: id,
          }, {
            transaction,
          });
          await plugin.db.BookInfoModel.update({
            // @ts-ignore
            count: plugin.db.sequelize.literal('count + 1'),
          }, {
            where: {
              id,
            },
            transaction,
          });
          await plugin.db.BookInfoModel.update({
            history: false,
            count: 1,
          }, {
            where: {
              id,
              history: true,
            },
            transaction,
          });
          await plugin.db.BookInfoModel.update({
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

const gql = require('graphql-tag');

const plugin = {
  models: undefined,
  typeDefs: gql`
    type Mutation {
        addHitomila(number: String! id: String!): Result!
    }
  `,
  init(models) {
    plugin.models = models;
  },
  middleware: {
    Mutation: () => ({
      addHitomila: (parent, { number, id }) => {
        return {
          success: true,
        };
      },
    }),
  },
};

module.exports = plugin;

import streamie from '../../../src';

const TOTAL_PAGES = 3;
const ARTICLES_PER_PAGE = 3;
function fetchArticles(page: number): Promise<{ data: { id: number; title: string }[]; meta: { pagination: { page: number; pages: number } } }> {
  return new Promise((resolve) => {
    const article = (page - 1) * ARTICLES_PER_PAGE;
    const data = new Array(ARTICLES_PER_PAGE).fill(null).map((_, i) => ({ id: article + i, title: `Article ${ article + i }` }));
    setTimeout(() => {
      resolve({
        data,
        meta: {
          pagination: {
            page,
            pages: TOTAL_PAGES,
          },
        },
      });
    }, 250);
  });
}

describe('Streamie', () => {
  describe('useCase paginator', () => {
    test('Should successfully establish paginator', async () => {
      const results: { id: number; title: string; }[] = [];

      const paginator = streamie(async (page: number, { self }) => {
        const response = await fetchArticles(page);
        if (response.meta.pagination.pages !== page) {
          self.push(page + 1); // Queue next page
        } else {
          self.drain(); // Indicate that we're done
        }
        // Push articles to output
        return response.data;
      }, { seed: 1 as number, flatten: true })
      .map((article) => {
        results.push(article);
      }, {});

      await paginator.promise;

      expect(results).toEqual([
        { id: 0, title: 'Article 0' },
        { id: 1, title: 'Article 1' },
        { id: 2, title: 'Article 2' },
        { id: 3, title: 'Article 3' },
        { id: 4, title: 'Article 4' },
        { id: 5, title: 'Article 5' },
        { id: 6, title: 'Article 6' },
        { id: 7, title: 'Article 7' },
        { id: 8, title: 'Article 8' },
      ]);
    });
  });
});

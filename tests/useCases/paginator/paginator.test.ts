import streamie from '../../../src';

const TOTAL_PAGES = 3;
const ARTICLES_PER_PAGE = 3;
const TOTAL_ARTICLES = TOTAL_PAGES * ARTICLES_PER_PAGE;
function fetchArticles(page: number): Promise<{ data: { id: number; title: string }[]; meta: { pagination: { page: number; totalPages: number } } }> {
  return new Promise((resolve) => {
    const article = (page - 1) * ARTICLES_PER_PAGE;
    const data = new Array(ARTICLES_PER_PAGE).fill(null).map((_, i) => ({ id: article + i, title: `Article ${ article + i }` }));
    setTimeout(() => {
      resolve({
        data,
        meta: {
          pagination: {
            page,
            totalPages: TOTAL_PAGES,
          },
        },
      });
    }, 250);
  });
}

async function modifyArticle(article: { id: number; title: string }): Promise<{ id: number; title: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ id: article.id, title: `Modified ${ article.title }` });
    }, 25);
  });
}

async function saveBatch(articles: { id: number; title: string }[]): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 25);
  });
}

describe('Streamie', () => {
  describe('useCase paginator', () => {
    test('Should successfully establish paginator', async () => {
      const initialMapResults: { id: number; title: string; }[] = [];
      const batchMapResults: { id: number; title: string; }[][] = [];
      const currentlyRunning = {
        mapA: 0,
        mapB: 0,
      };
      const runningTracker = {
        mapA: [] as number[],
        mapB: [] as number[],
      };

      const paginator = streamie(async (page: number, { self }) => {
        const response = await fetchArticles(page);
        if (response.meta.pagination.totalPages !== page) {
          self.push(page + 1); // Queue next page
        } else {
          self.drain(); // Indicate that we're done
        }
        // Push articles to output
        return response.data;
      }, { seed: 1, flatten: true })
      .map(async (article) => {
        runningTracker.mapA.push(++currentlyRunning.mapA);
        initialMapResults.push(article);
        const result = await modifyArticle(article);
        currentlyRunning.mapA--;
        return result;
      }, { concurrency: 3 })
      .map(async (articles) => {
        runningTracker.mapB.push(++currentlyRunning.mapB);
        batchMapResults.push(articles);
        const lastPageArticles = TOTAL_ARTICLES % 5;
        // Can be 5 or 4, because total articles is 9, so last page has 4 articles
        expect(articles.length === 5 || articles.length === lastPageArticles).toBe(true);
        const result = await saveBatch(articles);
        currentlyRunning.mapB--;
        return result;
      }, { batchSize: 5 });

      await paginator.promise;

      expect(initialMapResults).toEqual([
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

      expect(batchMapResults).toEqual([
        [
          { id: 0, title: 'Modified Article 0' },
          { id: 1, title: 'Modified Article 1' },
          { id: 2, title: 'Modified Article 2' },
          { id: 3, title: 'Modified Article 3' },
          { id: 4, title: 'Modified Article 4' },
        ],
        [
          { id: 5, title: 'Modified Article 5' },
          { id: 6, title: 'Modified Article 6' },
          { id: 7, title: 'Modified Article 7' },
          { id: 8, title: 'Modified Article 8' },
        ],
      ]);

      // Concurrency expectations
      // Slice first 3 because anything after that is too variable (with such fast timeouts) to test reliably
      expect(runningTracker.mapA.slice(0, 3)).toEqual([1, 2, 3]);
      expect(runningTracker.mapB).toEqual([1, 1]);
    });
  });
});

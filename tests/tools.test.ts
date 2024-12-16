import streamie from '../src';

const DATA = new Array(26).fill(undefined).map((value, i) => String.fromCharCode(65 + i));
const FILTERED = DATA.filter((letter, i) => i % 2 === 0);

async function getData(index: number) {
  return DATA[index];
}

describe('Streamie', () => {
  describe('tools', () => {
    // Test the map function
    test('drain and push', async () => {
      const result: string[] = [];
      const initialStreamie = streamie<number, string | void, {}>(async (
        page: number,
        {
          // self,
          drain,
          push,
          index,
        },
      ) => {
        const data = await getData(page);
        // if (!data) return self.drain();
        if (!data) return drain();
        push(index + 1); // This goes to the input queue
        return data; // This goes to the output queue
      }, { seed: 0 });

      const remainder = initialStreamie
      .filter((letter, { index }) => index % 2 === 0, {})
      .map((letter) => {
        if (letter) result.push(letter);
      }, {});

      await remainder.promise;
      expect(result).toEqual(FILTERED);
      expect (initialStreamie.state.isDrained).toBe(true);
      expect(remainder.state.isDrained).toBe(true);
    });
  });
});
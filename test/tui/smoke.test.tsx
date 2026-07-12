import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Text } from "ink";

describe("ink toolchain", () => {
  test("renders a Text node", () => {
    const { lastFrame } = render(<Text>coven-ready</Text>);
    expect(lastFrame()).toContain("coven-ready");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useUploadReady } from "./use-upload-ready";

describe("upload hydration boundary", () => {
  it("disables native upload controls in the server-rendered page", () => {
    function Upload() {
      const ready = useUploadReady();
      return createElement("input", { type: "file", disabled: !ready });
    }
    expect(renderToStaticMarkup(createElement(Upload))).toContain('disabled=""');
  });
});

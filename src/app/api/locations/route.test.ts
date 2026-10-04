import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), ids: vi.fn() }));
vi.mock("@/domains/locations/server/repository", () => ({ getLocations: mocks.list, getLocationsByIds: mocks.ids }));
import { GET } from "./route";
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); mocks.ids.mockResolvedValue([]); });
describe("bounded location reads", () => {
  it("passes server-side filters and pagination", async () => {
    expect((await GET(new Request("http://localhost/api/locations?region=제주&category=nature&limit=20&offset=20"))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ region: "제주", category: "nature", limit: 20, offset: 20 });
  });
  it("rejects invalid/oversized queries before DB access", async () => {
    for (const query of ["limit=51", "offset=-1", "region=unknown", "id=broken"]) {
      expect((await GET(new Request(`http://localhost/api/locations?${query}`))).status).toBe(400);
    }
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.ids).not.toHaveBeenCalled();
  });
  it("resolves saved ids explicitly, not from the first page", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await GET(new Request(`http://localhost/api/locations?id=${id}&id=${id}`));
    expect(mocks.ids).toHaveBeenCalledWith([id]);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns safe 503 for repository failure", async () => {
    const { dataAccessError } = await import("@/shared/errors/application-error");
    mocks.list.mockRejectedValue(dataAccessError("private SQL", new Error("secret")));
    const response = await GET(new Request("http://localhost/api/locations"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});

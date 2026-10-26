import * as SecureStore from "expo-secure-store";

import { secureSessionStorage } from "@/auth/secureStorage.native";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);

describe("native secure session storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItemAsync.mockResolvedValue(null);
    setItemAsync.mockResolvedValue(undefined);
    deleteItemAsync.mockResolvedValue(undefined);
  });

  it("preserves the existing chunked SecureStore representation", async () => {
    getItemAsync.mockResolvedValueOnce("3");
    const value = "a".repeat(1_801);

    await secureSessionStorage.setItem("session", value);

    expect(setItemAsync).toHaveBeenCalledWith("session.fiyu_0", "a".repeat(1_800));
    expect(setItemAsync).toHaveBeenCalledWith("session.fiyu_1", "a");
    expect(setItemAsync).toHaveBeenCalledWith("session.fiyu_chunks", "2");
    expect(deleteItemAsync).toHaveBeenCalledWith("session.fiyu_2");
  });

  it("reassembles complete chunks and treats a missing chunk as unrecoverable", async () => {
    getItemAsync
      .mockResolvedValueOnce("2")
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    await expect(secureSessionStorage.getItem("session")).resolves.toBe("firstsecond");

    getItemAsync
      .mockResolvedValueOnce("2")
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce(null);
    await expect(secureSessionStorage.getItem("session")).resolves.toBeNull();
  });

  it("deletes every stored chunk and its manifest", async () => {
    getItemAsync.mockResolvedValueOnce("2");

    await secureSessionStorage.removeItem("session");

    expect(deleteItemAsync).toHaveBeenCalledWith("session.fiyu_0");
    expect(deleteItemAsync).toHaveBeenCalledWith("session.fiyu_1");
    expect(deleteItemAsync).toHaveBeenCalledWith("session.fiyu_chunks");
  });
});

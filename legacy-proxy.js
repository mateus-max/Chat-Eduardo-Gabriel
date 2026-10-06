const TARGET = "https://chat-eduardo-gabriel.eduardongabriel354.workers.dev";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(TARGET);
    target.pathname = incoming.pathname;
    target.search = incoming.search;

    const forwarded = new Request(target.toString(), request);
    return fetch(forwarded);
  }
};

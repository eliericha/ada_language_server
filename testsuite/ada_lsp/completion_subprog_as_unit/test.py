from drivers import pylsp
from lsprotocol.types import (
    CompletionContext,
    CompletionParams,
    CompletionTriggerKind,
    TextDocumentIdentifier,
)


@pylsp.test()
async def test(lsp: pylsp.ALSLanguageClient) -> None:
    file_uri = lsp.didOpenFile("p1-p3.ads")

    await lsp.awaitIndexingEnd()

    result = await lsp.text_document_completion_async(
        CompletionParams(
            TextDocumentIdentifier(file_uri),
            pylsp.Pos(2, 13),
            CompletionContext(CompletionTriggerKind.Invoked),
        )
    )

    # TODO set an appropriate expected result
    lsp.assertEqual(pylsp.to_str(result), "")

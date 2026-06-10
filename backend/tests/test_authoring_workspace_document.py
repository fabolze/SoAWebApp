from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOCUMENT = ROOT / "AUTHORING_WORKSPACES_GAME_DESIGN.md"
REMOVED_DOCUMENT = ROOT / "SCHEMA_FREE_INTERACTIVE_AUTHORING_BLUEPRINT.md"

REQUIRED_WORKSPACE_SECTIONS = (
    "### Creative North Star",
    "### Current-Model Implementation",
    "### Future Expansion",
    "### Health Questions",
)


def _status_workspace_names(document: str) -> list[str]:
    status_block = document.split("## Workspace Status", 1)[1].split("\n## ", 1)[0]
    rows = []
    for line in status_block.splitlines():
        if not line.startswith("|") or line.startswith("|---"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if cells and cells[0] != "Workspace":
            rows.append(cells[0])
    return rows


def test_authoring_workspaces_have_one_canonical_complete_document():
    assert DOCUMENT.exists()
    assert not REMOVED_DOCUMENT.exists()

    document = DOCUMENT.read_text(encoding="utf-8")
    workspace_names = _status_workspace_names(document)

    assert workspace_names
    assert len(workspace_names) == len(set(workspace_names))

    previous_heading_position = -1
    for workspace_name in workspace_names:
        heading = f"## {workspace_name}"
        assert document.count(heading) == 1, f"{workspace_name} must have exactly one catalog entry"

        heading_position = document.index(heading)
        assert heading_position > previous_heading_position, (
            f"{workspace_name} catalog entry must follow status-index order"
        )
        previous_heading_position = heading_position

        workspace = document.split(heading, 1)[1].split("\n## ", 1)[0]
        for required_section in REQUIRED_WORKSPACE_SECTIONS:
            assert required_section in workspace, (
                f"{workspace_name} is missing required section: {required_section}"
            )

import argparse
import dataclasses
import datetime as dt
import logging
import os
import re
import sys
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests


NOTION_API_VERSION = "2022-06-28"
NOTION_PAGE_SIZE = 100
GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"

# Status values in Notion that should be ignored.
SKIP_STATUSES = {"Draft", "Blocked", "Done"}
TARGET_STATUSES = {"Ready", "To Do"}

BASE_LABELS = [
    "documentation",
    "planning",
    "devops",
    "automation",
    "ai-generated",
    "needs-review",
]

MODULE_LABEL_TEMPLATE = "module-{code}"
MILESTONE_TEMPLATE = "M{code}: {title}"
DEFAULT_MILESTONES = {
    "00": "Setup",
    "15": "Launch",
}
RETRY_STATUS_CODES = {403, 429, 500, 502, 503, 504}
MAX_RETRIES = 5


def load_env_file(path: Optional[str]) -> None:
    """Populate os.environ from a simple KEY=VALUE env file if provided."""

    if not path:
        return

    expanded = os.path.expanduser(path)
    if not os.path.exists(expanded):
        logging.debug("Env file %s does not exist; skipping load", expanded)
        return

    try:
        with open(expanded, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue

                if "=" not in line:
                    logging.warning("Ignoring malformed line in %s: %s", expanded, raw_line.rstrip())
                    continue

                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError as exc:
        logging.error("Failed to load environment file %s: %s", expanded, exc)


class RetryableSession:
    def __init__(self, headers: Dict[str, str]):
        self.session = requests.Session()
        self.session.headers.update(headers)

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        backoff = 1
        for attempt in range(MAX_RETRIES):
            response = self.session.request(method, url, **kwargs)
            if response.status_code not in RETRY_STATUS_CODES:
                return response

            reset_after = 0
            if response.status_code in {403, 429}:
                # Respect rate limit headers when available.
                reset_header = response.headers.get("X-RateLimit-Reset")
                remaining = response.headers.get("X-RateLimit-Remaining")
                if remaining == "0" and reset_header:
                    try:
                        reset_ts = int(reset_header)
                        reset_after = max(reset_ts - int(time.time()), 0)
                    except ValueError:
                        reset_after = 0

            sleep_for = max(reset_after, backoff)
            logging.warning(
                "Request to %s failed with %s. Retrying in %s seconds (attempt %s/%s)",
                url,
                response.status_code,
                sleep_for,
                attempt + 1,
                MAX_RETRIES,
            )
            time.sleep(sleep_for)
            backoff *= 2
        response.raise_for_status()
        return response


@dataclasses.dataclass
class ModuleInfo:
    code: str
    title: str

    @property
    def milestone_title(self) -> str:
        return MILESTONE_TEMPLATE.format(code=self.code, title=self.title)

    @property
    def label(self) -> str:
        return MODULE_LABEL_TEMPLATE.format(code=self.code)


class NotionClient:
    def __init__(self, api_key: str):
        self.session = RetryableSession(
            {
                "Authorization": f"Bearer {api_key}",
                "Notion-Version": NOTION_API_VERSION,
                "Content-Type": "application/json",
            }
        )

    def get_database(self, database_id: str) -> Dict[str, Any]:
        url = f"https://api.notion.com/v1/databases/{database_id}"
        response = self.session.request("GET", url)
        response.raise_for_status()
        return response.json()

    def query_database(self, database_id: str) -> Iterable[Dict[str, Any]]:
        url = f"https://api.notion.com/v1/databases/{database_id}/query"
        payload: Dict[str, Any] = {"page_size": NOTION_PAGE_SIZE}
        while True:
            response = self.session.request("POST", url, json=payload)
            response.raise_for_status()
            data = response.json()
            for result in data.get("results", []):
                yield result
            if not data.get("has_more"):
                break
            payload["start_cursor"] = data["next_cursor"]

    def update_issue_reference(self, page_id: str, issue_number: int, prop_type: str) -> None:
        url = f"https://api.notion.com/v1/pages/{page_id}"
        if prop_type == "number":
            prop_value = {"number": issue_number}
        else:
            prop_value = {"rich_text": [{"text": {"content": str(issue_number)}}]}
        body = {"properties": {"GitHubIssue": prop_value}}
        response = self.session.request("PATCH", url, json=body)
        if response.status_code >= 300:
            logging.error(
                "Failed to update GitHubIssue property for %s: %s %s",
                page_id,
                response.status_code,
                response.text,
            )


class GitHubClient:
    def __init__(self, token: str, owner: str, repo: str):
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }
        self.owner = owner
        self.repo = repo
        self.session = RetryableSession(headers)
        self.graphql_headers = headers

    def rest(self, method: str, path: str, **kwargs) -> requests.Response:
        url = f"{GITHUB_API}{path}"
        response = self.session.request(method, url, **kwargs)
        if response.status_code >= 300:
            logging.error("GitHub REST call failed %s %s: %s", method, path, response.text)
        response.raise_for_status()
        return response

    def graphql(self, query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
        for attempt in range(MAX_RETRIES):
            response = requests.post(
                GITHUB_GRAPHQL,
                json={"query": query, "variables": variables},
                headers=self.graphql_headers,
            )
            if response.status_code in RETRY_STATUS_CODES:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            data = response.json()
            if "errors" in data:
                raise RuntimeError(data["errors"])
            return data["data"]
        response.raise_for_status()
        return {}

    def get_milestones(self) -> Dict[str, Dict[str, Any]]:
        milestones: Dict[str, Dict[str, Any]] = {}
        page = 1
        while True:
            resp = self.rest(
                "GET",
                f"/repos/{self.owner}/{self.repo}/milestones",
                params={"state": "all", "per_page": 100, "page": page},
            )
            data = resp.json()
            if not data:
                break
            for milestone in data:
                milestones[milestone["title"]] = milestone
            page += 1
        return milestones

    def create_milestone(self, title: str) -> Dict[str, Any]:
        resp = self.rest(
            "POST",
            f"/repos/{self.owner}/{self.repo}/milestones",
            json={"title": title},
        )
        return resp.json()

    def get_labels(self) -> Dict[str, Dict[str, Any]]:
        labels: Dict[str, Dict[str, Any]] = {}
        page = 1
        while True:
            resp = self.rest(
                "GET",
                f"/repos/{self.owner}/{self.repo}/labels",
                params={"per_page": 100, "page": page},
            )
            data = resp.json()
            if not data:
                break
            for label in data:
                labels[label["name"]] = label
            page += 1
        return labels

    def create_label(self, name: str, color: str = "ededed") -> None:
        self.rest(
            "POST",
            f"/repos/{self.owner}/{self.repo}/labels",
            json={"name": name, "color": color},
        )

    def get_issue(self, number: int) -> Optional[Dict[str, Any]]:
        resp = self.session.request(
            "GET",
            f"{GITHUB_API}/repos/{self.owner}/{self.repo}/issues/{number}",
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def create_issue(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        resp = self.rest("POST", f"/repos/{self.owner}/{self.repo}/issues", json=payload)
        return resp.json()

    def update_issue(self, number: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        resp = self.rest(
            "PATCH",
            f"/repos/{self.owner}/{self.repo}/issues/{number}",
            json=payload,
        )
        return resp.json()


@dataclasses.dataclass
class SyncResult:
    action: str
    issue_number: Optional[int]
    page_id: str
    message: Optional[str] = None


def rich_text_to_markdown(rich_text: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for block in rich_text:
        text = block.get("plain_text", "")
        href = block.get("href")
        annotations = block.get("annotations", {})
        if not text:
            mention = block.get(block.get("type")) if block.get("type") else None
            if mention:
                text = mention.get("plain_text") or ""
        if not text:
            continue

        if annotations.get("code"):
            text = f"`{text}`"
        else:
            prefix = ""
            suffix = ""
            if annotations.get("bold"):
                prefix += "**"
                suffix = "**" + suffix
            if annotations.get("italic"):
                prefix += "*"
                suffix = "*" + suffix
            if annotations.get("strikethrough"):
                prefix += "~~"
                suffix = "~~" + suffix
            if annotations.get("underline"):
                prefix += "__"
                suffix = "__" + suffix
            text = f"{prefix}{text}{suffix}" if prefix or suffix else text

        if href:
            text = f"[{text}]({href})"
        parts.append(text)
    return "".join(parts).strip()


def blocks_to_markdown(blocks: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for block in blocks:
        block_type = block.get("type")
        if block_type == "paragraph":
            lines.append(rich_text_to_markdown(block["paragraph"].get("rich_text", [])))
        elif block_type in {"heading_1", "heading_2", "heading_3"}:
            hashes = "#" * int(block_type[-1])
            lines.append(f"{hashes} {rich_text_to_markdown(block[block_type]["rich_text"])}")
        elif block_type == "bulleted_list_item":
            lines.append(f"- {rich_text_to_markdown(block["bulleted_list_item"]["rich_text"])}")
        elif block_type == "numbered_list_item":
            lines.append(f"1. {rich_text_to_markdown(block["numbered_list_item"]["rich_text"])}")
        elif block_type == "to_do":
            checked = block["to_do"].get("checked")
            prefix = "- [x]" if checked else "- [ ]"
            lines.append(f"{prefix} {rich_text_to_markdown(block["to_do"]["rich_text"])}")
        elif block_type == "quote":
            content = rich_text_to_markdown(block["quote"]["rich_text"])
            lines.append(f"> {content}")
        elif block_type == "code":
            lang = block["code"].get("language") or ""
            content = "\n".join(
                span.get("plain_text", "") for span in block["code"].get("rich_text", [])
            )
            lines.append(f"```{lang}\n{content}\n```")
        else:
            # Fallback to plain text when type unsupported.
            text = block.get(block_type, {}).get("rich_text", [])
            if text:
                lines.append(rich_text_to_markdown(text))
    return "\n\n".join(line for line in lines if line).strip()


def extract_title(property_value: Dict[str, Any]) -> str:
    title = property_value.get("title", [])
    return "".join(part.get("plain_text", "") for part in title).strip()


def extract_rich_text(property_value: Dict[str, Any]) -> str:
    rich_text = property_value.get("rich_text", [])
    return blocks_to_markdown([{"type": "paragraph", "paragraph": {"rich_text": rich_text}}])


def extract_status(property_value: Dict[str, Any]) -> str:
    status = property_value.get("status")
    if isinstance(status, dict) and status:
        return status.get("name", "")
    select = property_value.get("select")
    if isinstance(select, dict) and select:
        return select.get("name", "")
    return ""


def extract_tags(property_value: Dict[str, Any]) -> List[str]:
    tags = property_value.get("multi_select", [])
    return [tag.get("name") for tag in tags if tag.get("name")]


def extract_module(property_value: Dict[str, Any]) -> Optional[ModuleInfo]:
    select = property_value.get("select")
    if not select:
        return None
    name = select.get("name", "").strip()
    if not name:
        return None
    match = re.match(r"(?P<code>\d{2})(?::\s*(?P<title>.*))?", name)
    if match:
        code = match.group("code")
        title = match.group("title") or name
    else:
        digits = re.findall(r"\d+", name)
        code = digits[0] if digits else name[:2]
        code = code.zfill(2)
        title = name
    return ModuleInfo(code=code, title=title)


def extract_assignees(property_value: Dict[str, Any]) -> List[str]:
    assignees: List[str] = []
    if "people" in property_value:
        for person in property_value.get("people", []):
            person_name = person.get("name") or person.get("person", {}).get("email")
            if person_name:
                assignees.append(person_name)
    elif "rich_text" in property_value:
        text = rich_text_to_markdown(property_value["rich_text"])
        if text:
            assignees.extend([part.strip() for part in re.split(r",|\s+", text) if part.strip()])
    elif "title" in property_value:
        assignees.append(extract_title(property_value))
    return assignees


def extract_due_date(property_value: Dict[str, Any]) -> Optional[str]:
    date = property_value.get("date")
    if not date:
        return None
    start = date.get("start")
    if not start:
        return None
    try:
        parsed = dt.datetime.fromisoformat(start)
    except ValueError:
        return None
    return parsed.date().isoformat()


def extract_files(property_value: Dict[str, Any]) -> List[Tuple[str, str]]:
    files = property_value.get("files", [])
    links: List[Tuple[str, str]] = []
    for file_obj in files:
        name = file_obj.get("name")
        if file_obj.get("type") == "file":
            url = file_obj["file"].get("url")
        elif file_obj.get("type") == "external":
            url = file_obj["external"].get("url")
        else:
            url = None
        if name and url:
            links.append((name, url))
    return links


def extract_link(property_value: Dict[str, Any]) -> Optional[str]:
    if "url" in property_value and property_value["url"]:
        return property_value["url"]
    if "rich_text" in property_value:
        text = property_value["rich_text"]
        if text and text[0].get("href"):
            return text[0]["href"]
    return None


def fetch_notion_blocks(client: NotionClient, page_id: str) -> List[Dict[str, Any]]:
    blocks: List[Dict[str, Any]] = []
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    start_cursor: Optional[str] = None
    while True:
        params: Dict[str, Any] = {"page_size": NOTION_PAGE_SIZE}
        if start_cursor:
            params["start_cursor"] = start_cursor
        response = client.session.request("GET", url, params=params)
        response.raise_for_status()
        data = response.json()
        blocks.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        start_cursor = data.get("next_cursor")
    return blocks


def convert_content_to_markdown(client: NotionClient, page: Dict[str, Any], content_property: Dict[str, Any]) -> str:
    rich_text = content_property.get("rich_text", [])
    body = ""
    if rich_text:
        body = blocks_to_markdown(
            [{"type": "paragraph", "paragraph": {"rich_text": rich_text}}]
        )
    else:
        blocks = fetch_notion_blocks(client, page["id"])
        body = blocks_to_markdown(blocks)
    return body


def ensure_milestones(gh: GitHubClient, modules: List[ModuleInfo]) -> Dict[str, Dict[str, Any]]:
    existing = gh.get_milestones()
    milestones_by_title = dict(existing)

    required_modules = {module.milestone_title for module in modules}
    for code, title in DEFAULT_MILESTONES.items():
        required_modules.add(MILESTONE_TEMPLATE.format(code=code, title=title))

    for title in sorted(required_modules):
        if title in milestones_by_title:
            continue
        logging.info("Creating milestone %s", title)
        milestone = gh.create_milestone(title)
        milestones_by_title[title] = milestone

    return milestones_by_title


def ensure_labels(gh: GitHubClient, modules: List[ModuleInfo]) -> None:
    existing = gh.get_labels()
    required_labels = set(BASE_LABELS)
    required_labels.add(MODULE_LABEL_TEMPLATE.format(code="00"))
    for module in modules:
        required_labels.add(module.label)
    # Always ensure module-01..module-14 exist.
    required_labels.update({MODULE_LABEL_TEMPLATE.format(code=f"{i:02d}") for i in range(1, 15)})

    for label in sorted(required_labels):
        if label in existing:
            continue
        logging.info("Creating label %s", label)
        gh.create_label(label)


def get_project_info(gh: GitHubClient, owner: str, project_title: str) -> Dict[str, Any]:
    query = """
    query($owner: String!, $repo: String!, $projectTitle: String!) {
      repository(owner: $owner, name: $repo) {
        projectsV2(first: 20, query: $projectTitle) {
          nodes {
            id
            title
            fields(first: 50) {
              nodes {
                ... on ProjectV2FieldCommon {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
      organization(login: $owner) {
        projectsV2(first: 20, query: $projectTitle) {
          nodes {
            id
            title
            fields(first: 50) {
              nodes {
                ... on ProjectV2FieldCommon {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
      user(login: $owner) {
        projectsV2(first: 20, query: $projectTitle) {
          nodes {
            id
            title
            fields(first: 50) {
              nodes {
                ... on ProjectV2FieldCommon {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
    """
    data = gh.graphql(
        query,
        {"owner": owner, "repo": gh.repo, "projectTitle": project_title},
    )

    def find_project(container: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not container:
            return None
        for node in container.get("projectsV2", {}).get("nodes", []):
            if node.get("title") == project_title:
                return node
        return None

    repo_project = find_project(data.get("repository")) if data.get("repository") else None
    if repo_project:
        return repo_project

    org_project = find_project(data.get("organization")) if data.get("organization") else None
    if org_project:
        return org_project

    user_project = find_project(data.get("user")) if data.get("user") else None
    if user_project:
        return user_project

    raise RuntimeError(f"Project '{project_title}' not found for owner {owner}")


def ensure_issue_project_status(
    gh: GitHubClient,
    project: Dict[str, Any],
    issue_node_id: str,
    desired_status: str,
) -> None:
    status_field_id = None
    todo_option_id = None
    for field in project.get("fields", {}).get("nodes", []):
        if field.get("name") == "Status":
            status_field_id = field.get("id")
            options = field.get("options") or []
            for option in options:
                if option.get("name") == desired_status:
                    todo_option_id = option.get("id")
            break
    if not status_field_id or not todo_option_id:
        raise RuntimeError("Project status field or option not found")

    query = """
    query($nodeId: ID!) {
      node(id: $nodeId) {
        ... on Issue {
          projectItemsV2(first: 20) {
            nodes {
              id
              project {
                id
              }
            }
          }
        }
      }
    }
    """
    data = gh.graphql(query, {"nodeId": issue_node_id})
    issue_node = data.get("node") or {}
    project_items = issue_node.get("projectItemsV2", {}).get("nodes", [])
    project_id = project.get("id")
    item_id = None
    for item in project_items:
        if item.get("project", {}).get("id") == project_id:
            item_id = item.get("id")
            break

    if not item_id:
        mutation = """
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
            item {
              id
            }
          }
        }
        """
        add_resp = gh.graphql(mutation, {"projectId": project_id, "contentId": issue_node_id})
        item_id = add_resp["addProjectV2ItemById"]["item"]["id"]

    mutation = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: {singleSelectOptionId: $optionId}
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
    """
    gh.graphql(
        mutation,
        {
            "projectId": project_id,
            "itemId": item_id,
            "fieldId": status_field_id,
            "optionId": todo_option_id,
        },
    )


def set_issue_due_date(gh: GitHubClient, issue_node_id: str, due_date: Optional[str]) -> None:
    if not due_date:
        return
    mutation = """
    mutation($id: ID!, $dueDate: Date!) {
      updateIssue(input: {id: $id, dueDate: $dueDate}) {
        issue {
          id
        }
      }
    }
    """
    gh.graphql(mutation, {"id": issue_node_id, "dueDate": due_date})


def collect_module_options(database: Dict[str, Any]) -> List[ModuleInfo]:
    module_property = database.get("properties", {}).get("Module")
    options = module_property.get("select", {}).get("options", []) if module_property else []
    modules: Dict[str, ModuleInfo] = {}
    for option in options:
        info = extract_module({"select": option})
        if info:
            modules[info.code] = info
    # Ensure default modules 01-14 exist even if not in options.
    for i in range(1, 15):
        code = f"{i:02d}"
        if code not in modules:
            modules[code] = ModuleInfo(code=code, title=f"Module {code}")
    if "15" not in modules:
        modules["15"] = ModuleInfo(code="15", title=DEFAULT_MILESTONES["15"])
    return list(modules.values())


def append_links_and_files(
    body: str,
    link: Optional[str],
    files: List[Tuple[str, str]],
) -> str:
    sections: List[str] = [body.strip()] if body else []
    if link:
        sections.append("## Links\n\n- [External Link]({})".format(link))
    if files:
        lines = ["## Files", ""]
        lines.extend(f"- [{name}]({url})" for name, url in files)
        sections.append("\n".join(lines))
    return "\n\n".join(section for section in sections if section).strip()


def sync_page(
    notion: NotionClient,
    gh: GitHubClient,
    project_info: Dict[str, Any],
    milestones: Dict[str, Dict[str, Any]],
    github_issue_prop_type: str,
    page: Dict[str, Any],
) -> SyncResult:
    page_id = page["id"]
    properties = page.get("properties", {})

    status_name = extract_status(properties.get("Status", {}))
    if status_name in SKIP_STATUSES:
        return SyncResult(action="skipped", issue_number=None, page_id=page_id, message="status")
    if status_name and status_name not in TARGET_STATUSES:
        return SyncResult(action="skipped", issue_number=None, page_id=page_id, message="status")

    title = extract_title(properties.get("Name", {}))
    if not title:
        return SyncResult("skipped", None, page_id, "missing title")

    content_property = properties.get("Content", {})
    body = convert_content_to_markdown(notion, page, content_property)
    if not body:
        return SyncResult("skipped", None, page_id, "missing content")

    tags = extract_tags(properties.get("Tags", {}))
    module_info = extract_module(properties.get("Module", {}))
    module_label = module_info.label if module_info else MODULE_LABEL_TEMPLATE.format(code="00")
    if module_label not in tags:
        tags.append(module_label)
    # Remove duplicates while preserving order.
    seen = set()
    deduped_labels: List[str] = []
    for label in tags:
        if label in seen or not label:
            continue
        seen.add(label)
        deduped_labels.append(label)

    milestone_title = (
        module_info.milestone_title if module_info else MILESTONE_TEMPLATE.format(code="00", title=DEFAULT_MILESTONES["00"])
    )
    milestone_id = milestones.get(milestone_title, {}).get("number")
    if milestone_id is None:
        milestone = gh.create_milestone(milestone_title)
        milestones[milestone_title] = milestone
        milestone_id = milestone.get("number")

    assignees = extract_assignees(properties.get("Assignee", {}))
    due_date = extract_due_date(properties.get("Due", {}))
    link = extract_link(properties.get("Link", {})) if "Link" in properties else None
    files = extract_files(properties.get("Files", {})) if "Files" in properties else []

    body = append_links_and_files(body, link, files)

    issue_payload = {
        "title": title,
        "body": body,
        "labels": deduped_labels,
    }
    if milestone_id is not None:
        issue_payload["milestone"] = milestone_id
    if assignees:
        issue_payload["assignees"] = assignees

    existing_issue_number = None
    github_issue_prop = properties.get("GitHubIssue")
    if github_issue_prop:
        if github_issue_prop_type == "number":
            existing_issue_number = github_issue_prop.get("number")
        else:
            text = extract_rich_text(github_issue_prop)
            if text.isdigit():
                existing_issue_number = int(text)

    action = "created"
    issue_number: Optional[int] = None
    issue_node_id: Optional[str] = None
    try:
        if existing_issue_number:
            issue = gh.update_issue(existing_issue_number, issue_payload)
            issue_number = issue.get("number")
            issue_node_id = issue.get("node_id")
            action = "updated"
        else:
            issue = gh.create_issue(issue_payload)
            issue_number = issue.get("number")
            issue_node_id = issue.get("node_id")
            notion.update_issue_reference(page_id, issue_number, github_issue_prop_type)
    except Exception as exc:  # noqa: BLE001
        logging.exception("Failed to sync issue for page %s", page_id)
        return SyncResult("error", existing_issue_number, page_id, str(exc))

    if not issue_node_id:
        logging.error("Issue node ID missing for issue %s", issue_number)
        return SyncResult(action, issue_number, page_id, "missing node id")

    try:
        ensure_issue_project_status(gh, project_info, issue_node_id, "ToDo")
    except Exception as exc:  # noqa: BLE001
        logging.exception("Failed to ensure project status for issue %s", issue_number)

    try:
        set_issue_due_date(gh, issue_node_id, due_date)
    except Exception as exc:  # noqa: BLE001
        logging.exception("Failed to set due date for issue %s", issue_number)

    return SyncResult(action, issue_number, page_id)


def configure_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s: %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Notion tasks with GitHub issues")
    parser.add_argument("--notion-db", default=os.getenv("NOTION_DB_ID"))
    parser.add_argument("--github-owner", default="qetevanarotato-star")
    parser.add_argument("--github-repo", default="AST-Aros-Financial-Paradigm")
    parser.add_argument("--project", default="AROS STUDIO TOKENOMICS PARADIGM")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    notion_api_key = os.getenv("NOTION_API_KEY")
    github_token = os.getenv("PAT_AST_CI") or os.getenv("GITHUB_TOKEN")

    if not notion_api_key:
        logging.error("NOTION_API_KEY is required")
        sys.exit(1)
    if not args.notion_db:
        logging.error("NOTION_DB_ID is required")
        sys.exit(1)
    if not github_token:
        logging.error("PAT_AST_CI or GITHUB_TOKEN is required")
        sys.exit(1)

    configure_logging(args.verbose)

    notion = NotionClient(notion_api_key)
    gh = GitHubClient(github_token, args.github_owner, args.github_repo)

    database = notion.get_database(args.notion_db)
    modules = collect_module_options(database)

    milestones = ensure_milestones(gh, modules)
    ensure_labels(gh, modules)

    project_info = get_project_info(gh, args.github_owner, args.project)

    github_issue_prop = database.get("properties", {}).get("GitHubIssue", {})
    github_issue_prop_type = github_issue_prop.get("type", "number")

    created = 0
    updated = 0
    skipped = 0
    errors = 0
    operations: List[SyncResult] = []

    for page in notion.query_database(args.notion_db):
        try:
            result = sync_page(
                notion,
                gh,
                project_info,
                milestones,
                github_issue_prop_type,
                page,
            )
            operations.append(result)
            if result.action == "created":
                created += 1
            elif result.action == "updated":
                updated += 1
            elif result.action == "skipped":
                skipped += 1
            elif result.action == "error":
                errors += 1
        except Exception as exc:  # noqa: BLE001
            logging.exception("Failed to process page %s", page.get("id"))
            operations.append(SyncResult("error", None, page.get("id", ""), str(exc)))
            errors += 1

    summary_lines = [
        "Sync summary:",
        f"  Created: {created}",
        f"  Updated: {updated}",
        f"  Skipped: {skipped}",
        f"  Errors: {errors}",
        "Details:",
    ]
    for op in operations:
        summary_lines.append(
            f"  - {op.action}: page {op.page_id}"
            + (f" -> issue #{op.issue_number}" if op.issue_number else "")
            + (f" ({op.message})" if op.message else "")
        )

    print("\n".join(summary_lines))


if __name__ == "__main__":
    main()

"""Public package must run without another checkout or a personal skill install."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import skill_inventory
import workbench as w


class PortableTests(unittest.TestCase):
    def test_bundled_demo_inventory(self):
        data = w.inventory()
        self.assertFalse(data['errors'])
        self.assertEqual(8, data['count'])
        self.assertTrue(all(Path(row['path']).is_relative_to(w.ROOT / 'examples') for row in data['skills']))

    def test_project_paths_resolve_against_checkout(self):
        with tempfile.TemporaryDirectory() as cwd, patch('os.getcwd', return_value=cwd):
            files, skipped = w.project_files({'project_roots': ['examples/project']})
        self.assertFalse(skipped)
        self.assertTrue(any(Path(path).name == 'brief.md' for path in files))

    def test_scanner_is_independent_from_codex_config_in_demo(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, CODEX_HOME=folder):
            (Path(folder) / 'config.toml').write_text('invalid toml = [', encoding='utf-8')
            rows = skill_inventory.inventory(Path(folder), [w.ROOT / 'examples/skills'])
        self.assertEqual(8, rows['count'])

    def test_metadata_multiline_description(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'SKILL.md'
            path.write_text('---\nname: demo\ndescription: >\n  first line\n  second line\n---\n', encoding='utf-8')
            self.assertEqual('first line second line', skill_inventory.frontmatter(path)['description'])


if __name__ == '__main__':
    unittest.main()

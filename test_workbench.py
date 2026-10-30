"""Small regression suite for retrieval, scope boundaries and conservative checks."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import workbench as w


class WorkbenchTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.project = self.root / 'project'
        self.project.mkdir()
        self.doc = self.project / 'guide.md'
        self.doc.write_text('# 일정 안내\n반복 일정은 매주 수요일입니다.\n', encoding='utf-8')
        (self.project / '.env').write_text('NOT_FOR_SEARCH=private', encoding='utf-8')
        hidden = self.project / '.git'
        hidden.mkdir()
        (hidden / 'private.md').write_text('금지문서비밀', encoding='utf-8')
        self.a = self.root / 'a-SKILL.md'
        self.b = self.root / 'b-SKILL.md'
        self.a.write_text('---\nname: free-design-references\ndescription: 디자인 참고\n---\n# 무료 참고\n시각 구현은 frontend-design 지침으로 진행합니다.\n', encoding='utf-8')
        self.b.write_text('---\nname: frontend-design\ndescription: 화면 디자인\n---\n# 화면 디자인\nColor: use meaningful colors\n', encoding='utf-8')
        rows = [{'name': n, 'description': '디자인 참고', 'invocation': '$'+n, 'path': str(p), 'origin': 'local', 'disabled': False}
                for n, p in [('free-design-references', self.a), ('frontend-design', self.b)]]
        self.raw = {'skills': rows, 'errors': [], 'count': 2}
        self.settings = self.root / 'settings.json'
        self.settings.write_text(json.dumps({'project_roots': [str(self.project)]}), encoding='utf-8')
        (self.root / 'compatibility.json').write_bytes((w.ROOT / 'compatibility.json').read_bytes())
        (self.root / 'recommendations.json').write_bytes((w.ROOT / 'recommendations.json').read_bytes())
        (self.root / 'korean_guides.json').write_text('{}', encoding='utf-8')
        label_data = w.labels()
        self.patches = [patch.object(w, 'ROOT', self.root), patch.object(w, 'DB', self.root / 'index.db'),
                        patch.object(w, 'inventory', lambda: self.raw), patch.object(w, 'labels', lambda: label_data)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def test_korean_search_exact_citation_and_scoped_read(self):
        result = w.search('반복 일정', kind='project')['results'][0]
        self.assertEqual(result['path'], str(self.doc.resolve()))
        self.assertIn('수요일', result['body'])
        doc = w.read_document(result['doc_id'])
        self.assertEqual(doc['body'].splitlines()[1], '반복 일정은 매주 수요일입니다.')
        self.assertEqual(w.search('금지문서비밀')['results'], [])
        with self.assertRaises(ValueError):
            w.read_document('../../.env')

    def test_changes_and_deletions_update_search(self):
        self.assertTrue(w.search('수요일')['results'])
        self.doc.write_text('# 일정 안내\n새로운마감일은 목요일\n', encoding='utf-8')
        self.assertTrue(w.search('새로운마감일')['results'])
        self.assertEqual(w.search('수요일')['results'], [])
        self.doc.unlink()
        self.assertEqual(w.search('새로운마감일')['results'], [])

    def test_no_false_compatibility_after_evidence_removed(self):
        names = ['free-design-references', 'frontend-design']
        self.assertEqual(w.check(names)['status'], '문서상 조합 가능')
        self.a.write_text('원문에서 연결 근거가 제거되었습니다.', encoding='utf-8')
        report = w.check(names)
        self.assertEqual(report['status'], '확인 필요')
        self.assertEqual(len(report['unknown_pairs']), 1)

    def test_disabled_and_changed_duplicate(self):
        self.raw['skills'][0]['disabled'] = True
        self.assertEqual(w.check(['free-design-references'])['status'], '사용 불가 항목 있음')
        duplicate = dict(self.raw['skills'][1], path=str(self.a))
        self.raw['skills'].append(duplicate)
        self.assertTrue(any('다른 등록본' in f['message'] for f in w.check(['frontend-design'])['findings']))

    def test_validation_and_basket_roundtrip(self):
        for names in [['missing'], ['frontend-design']*2, [123], 'frontend-design']:
            with self.assertRaises(ValueError):
                w.check(names)
        with self.assertRaises(ValueError):
            w.search('x', limit=100)
        with self.assertRaises(ValueError):
            w.export_basket({'names':['frontend-design'], 'goal':{'bad':'data'}})
        w.search('" OR 1=1;--')
        self.assertEqual(w.refresh()['document_count'], 3)
        saved = w.save_basket({'names':['frontend-design'], 'goal':'내 화면 만들기'})
        self.assertEqual(w.basket(), saved)
        self.assertIn('$frontend-design', w.export_basket(saved))
        self.assertIn('승인이 아닙니다', w.export_basket(saved))

    def test_korean_guide_index_and_original_change_notice(self):
        import hashlib
        guide_dir = self.root / 'korean'
        guide_dir.mkdir()
        guide = guide_dir / 'frontend-design.md'
        guide.write_text('# frontend-design 한국어 사용 설명서\n브랜드설계안내입니다.\n', encoding='utf-8')
        (self.root / 'korean_guides.json').write_text(json.dumps({'frontend-design':['브랜드와 목적에 맞는 화면을 설계합니다.','','']}), encoding='utf-8')
        (guide_dir / 'manifest.json').write_text(json.dumps({'sources':{'frontend-design':[{'path':str(self.b.resolve()),'sha256':hashlib.sha256(self.b.read_bytes()).hexdigest()}]}}), encoding='utf-8')
        cat = w.refresh()
        skill = next(s for s in cat['skills'] if s['name']=='frontend-design')
        self.assertFalse(skill['korean']['stale'])
        self.assertIn('브랜드', skill['description'])
        self.assertEqual(w.search('브랜드설계안내', kind='skill')['results'][0]['path'], str(guide.resolve()))
        self.b.write_text('원본이 변경됨', encoding='utf-8')
        cat = w.refresh()
        self.assertTrue(next(s for s in cat['skills'] if s['name']=='frontend-design')['korean']['stale'])
        self.raw['skills'] = self.raw['skills'][:1]
        self.assertEqual(w.search('브랜드설계안내')['results'], [])

    def test_recommend_only_installed_active_skills_and_missing_roles(self):
        result = w.recommend('반복 일정 설정 화면 만들기')
        plan = result['plans'][0]
        self.assertFalse(result['api_required'])
        self.assertEqual(plan['id'],'web-ui')
        self.assertEqual({s['name'] for s in plan['items']}, {'frontend-design','free-design-references'})
        self.assertTrue(plan['missing'])
        self.assertTrue(all(s['evidence'] for s in plan['items']))
        self.raw['skills'][1]['disabled'] = True
        self.assertNotIn('frontend-design', [s['name'] for s in w.recommend('화면 제작')['plans'][0]['items']])
        self.assertEqual(w.recommend('아무거나 좀 해줘')['plans'], [])
        self.assertEqual(w.recommend('이미지 생성')['plans'][0]['items'], [])
        for invalid in ['', None, '가'*2001]:
            with self.assertRaises(ValueError):
                w.recommend(invalid)

    def test_explicit_video_engine_and_bug_intent(self):
        result = w.recommend('Remotion 소개 영상과 자막 만들기')
        self.assertEqual(result['plans'][0]['id'], 'remotion-video')
        self.assertNotIn('hyperframes-video', [p['id'] for p in result['plans']])
        self.assertEqual(w.recommend('웹앱 오류 원인 조사')['plans'][0]['id'],'debug')


if __name__ == '__main__':
    unittest.main()

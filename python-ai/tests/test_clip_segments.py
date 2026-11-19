"""Regression checks for cut timing, caption placement and queued pre-segment exports."""
import unittest
from app.clips import CaptionStyle, Export, Rect, Segment, caption_bounds, caption_image, layout_graph


def section(height):
    return Rect(sectionHeight=height, x=0, y=0, w=320, h=180, dx=0, dy=0, dw=1080, dh=height)


class SegmentTests(unittest.TestCase):
    def test_cut_belongs_to_first_frame_at_or_after_marker(self):
        meta = {"stream": 0, "width": 320, "height": 180, "rate": "30/1"}
        cuts = [Segment(at=0, sections=[section(1920)]),
                Segment(at=5.001, sections=[section(576), section(1344)])]
        graph, output = layout_graph(meta, cuts, 7)
        graph = ";".join(graph)
        self.assertIn("trim=start_frame=0:end_frame=151", graph)
        self.assertIn("trim=start_frame=151,", graph)
        self.assertIn("vstack", graph)
        self.assertNotIn("atrim", graph)
        self.assertEqual(output, "[cut]")

    def test_legacy_snapshot_still_decodes(self):
        request = Export(id="01234567-89ab-cdef-0123-456789abcdef", path="uploads/original.mp4",
                         start=1, end=2, top=section(960), bottom=section(960), cues=[])
        self.assertFalse(request.segments)
        self.assertEqual(request.style, CaptionStyle())

    def test_bilingual_caption_preserves_lines_and_font_selection(self):
        from app.clips import metrics
        from PIL import features
        self.assertTrue(features.check_feature("raqm"))
        text = "पहली बाज़ी\nOpening rally"
        sans = CaptionStyle(size=52, background=False)
        serif = CaptionStyle(size=52, font="serif", weight=700, outline=2, align="left")
        self.assertEqual(metrics(text, sans)[1], text)
        self.assertNotEqual(caption_image(text, sans).tobytes(), caption_image(text, serif).tobytes())

    def test_warning_boxes_include_the_rendered_caption_at_its_final_position(self):
        style = CaptionStyle(size=72, y=900, color="#ffdf60")
        text = "Watch the split"
        metrics = caption_bounds(text, style)
        left, top, right, bottom = caption_image(text, style).getbbox()
        self.assertEqual(metrics["bounds"], [left, top + style.y, right-1, bottom-1 + style.y])
        self.assertFalse(metrics["overflow"])
        self.assertTrue(caption_bounds("long caption " * 70, style)["overflow"])

import View from "../View";
import { VIEWTYPE } from "@/core/constants";
import type GraphView from "../GraphViews";
import type SelectBoxView from "../GraphViews/SelectBoxView";
import type ImageView from "../MediaViews/ImageView";
import type VideoView from "../MediaViews/VideoView";
import type TextView from "../TextView";
import type CombinedView from "../CombinedViews";

export function isView(view: any): view is View {
  return view instanceof View || view?.type === VIEWTYPE.VIEW;
}

export function isGraphView(view: any): view is GraphView {
  return view !== null && view.type === VIEWTYPE.GRAPHVIEW;
}

export function isSelectBoxView(view: any): view is SelectBoxView {
  return view !== null && view.type === VIEWTYPE.SELECTBOXVIEW;
}

export function isImageView(view: any): view is ImageView {
  return view !== null && view.type === VIEWTYPE.IMAGEVIEW;
}

export function isVideoView(view: any): view is VideoView {
  return view !== null && view.type === VIEWTYPE.VIDEOVIEW;
}

export function isTextView(view: any): view is TextView {
  return view !== null && view.type === VIEWTYPE.TEXTVIEW;
}

export function isCombinedView(view: any): view is CombinedView {
  return view !== null && view.type === VIEWTYPE.COMBINEDVIEW;
}

import View from "../View";
import { VIEWTYPE } from "@/core/constants";
import GraphView from "../GraphViews";
import SelectBoxView from "../GraphViews/SelectBoxView";
import ImageView from "../MediaViews/ImageView";
import VideoView from "../MediaViews/VideoView";
import TextView from "../TextView";
import CombinedView from "../CombinedViews";

export function isView(view: any): view is View {
  return view instanceof View;
}

export function isGraphView(view: any): view is GraphView {
  return view instanceof GraphView;
}

export function isSelectBoxView(view: any): view is SelectBoxView {
  return view instanceof SelectBoxView;
}

export function isImageView(view: any): view is ImageView {
  return view instanceof ImageView;
}

export function isVideoView(view: any): view is VideoView {
  return view instanceof VideoView;
}

export function isTextView(view: any): view is TextView {
  return view instanceof TextView;
}

export function isCombinedView(view: any): view is CombinedView {
  return view instanceof CombinedView;
}

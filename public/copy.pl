#!/usr/bin/perl
# arc-to-chrome: copy your Arc sidebar, its icons and your Chrome profile list to the
# clipboard, so https://arc-to-chrome.vercel.app can turn them into Chrome bookmarks.
#
# Read-only: it never changes Arc or Chrome, and sends nothing anywhere. It only reads
#   ~/Library/Application Support/Arc/StorableSidebar.json      (spaces, folders, tab names)
#   ~/Library/Application Support/Arc/SidebarItemsFaviconCache/  (the icons Arc shows)
#   ~/Library/Application Support/Arc/User Data/Local State      (Arc profile names)
#   ~/Library/Application Support/Google/Chrome/Local State      (Chrome profile names)
# and puts the result on the clipboard with pbcopy. Uses only Perl's standard library.
#
# Usage:  curl -fsSL https://arc-to-chrome.vercel.app/copy.pl | perl
use strict;
use warnings;
use JSON::PP;
use Digest::MD5 qw(md5_hex);
use MIME::Base64 qw(encode_base64);

my $support = "$ENV{HOME}/Library/Application Support";
my $arc     = "$support/Arc";
my $json    = JSON::PP->new->utf8->canonical;

sub slurp {
  my ($path) = @_;
  open(my $fh, '<:raw', $path) or return undef;
  local $/;
  my $data = <$fh>;
  close $fh;
  return $data;
}

sub profiles_section {
  my ($path) = @_;
  my $raw = slurp($path) // return undef;
  my $state = eval { $json->decode($raw) } or return undef;
  my $section = $state->{profile} or return undef;
  my %cache;
  # Keep only what the page uses: names, account name, colour, work badge.
  for my $dir (keys %{ $section->{info_cache} || {} }) {
    my $p = $section->{info_cache}{$dir};
    $cache{$dir} = { map { exists $p->{$_} ? ($_ => $p->{$_}) : () }
      qw(name gaia_name profile_highlight_color default_avatar_fill_color is_managed hosted_domain) };
  }
  return { profiles_order => $section->{profiles_order} || [], info_cache => \%cache };
}

my $sidebar_raw = slurp("$arc/StorableSidebar.json")
  or die "Couldn't find Arc's data in $arc. Is Arc installed for this user?\n";
my $sidebar = $json->decode($sidebar_raw);

# Arc names each icon file after the MD5 of the sidebar item's id.
my %icons;
for my $container (@{ $sidebar->{sidebar}{containers} || [] }) {
  for my $item (@{ $container->{items} || [] }) {
    next unless ref $item eq 'HASH' && $item->{data} && $item->{data}{tab};
    my $png = slurp("$arc/SidebarItemsFaviconCache/" . md5_hex($item->{id})) // next;
    next if length($png) > 64 * 1024;
    $icons{ $item->{id} } = 'data:image/png;base64,' . encode_base64($png, '');
  }
}

my $bundle = {
  arcToChrome    => 1,
  arcSidebar     => $sidebar,
  icons          => \%icons,
  arcProfiles    => profiles_section("$arc/User Data/Local State"),
  chromeProfiles => profiles_section("$support/Google/Chrome/Local State"),
};

open(my $clip, '|-', 'pbcopy') or die "Couldn't run pbcopy\n";
print $clip $json->encode($bundle);
close $clip;

my $spaces = grep { ref $_ eq 'HASH' } map { @{ $_->{spaces} || [] } } @{ $sidebar->{sidebar}{containers} || [] };
my $chrome = $bundle->{chromeProfiles} ? scalar(keys %{ $bundle->{chromeProfiles}{info_cache} }) : 0;
printf "Copied %d Arc spaces, %d icons and %d Chrome profiles.\n", $spaces, scalar(keys %icons), $chrome;
print "Now go back to the page and press Cmd+V.\n";
